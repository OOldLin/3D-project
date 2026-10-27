/* =========================================================================
   动力之心 · 汽车发动机 3D 智能剖视
   Three.js · single scene · four-stroke live simulation
   ========================================================================= */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const canvas = $('#scene');
  const loader = $('#loader');
  const fallback = $('#fallback');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.addEventListener('error', () => {
    if (!document.body.classList.contains('ready')) {
      loader.classList.add('hidden');
      fallback.classList.add('show');
    }
  });

  if (!window.THREE) {
    loader.classList.add('hidden');
    fallback.classList.add('show');
    return;
  }

  /* ── renderer ─────────────────────────────────────────────────────────── */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    loader.classList.add('hidden');
    fallback.classList.add('show');
    console.error('WebGL init failed:', err);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xeee8d9, 40, 96);

  // procedural studio / outdoor IBL so the metal parts pick up warm highlights
  (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0, '#fffdf4');
    sky.addColorStop(.55, '#eee8d8');
    sky.addColorStop(1, '#cfd7c1');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 300);
    const ground = ctx.createLinearGradient(0, 280, 0, 512);
    ground.addColorStop(0, '#b3b59d');
    ground.addColorStop(.5, '#8b8a74');
    ground.addColorStop(1, '#5e5a4b');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 280, 1024, 232);
    const sunGlow = ctx.createRadialGradient(730, 104, 2, 730, 104, 150);
    sunGlow.addColorStop(0, 'rgba(255,255,244,1)');
    sunGlow.addColorStop(.14, 'rgba(255,247,216,.94)');
    sunGlow.addColorStop(.45, 'rgba(255,229,183,.35)');
    sunGlow.addColorStop(1, 'rgba(255,226,180,0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(560, 0, 340, 300);
    const bounce = ctx.createRadialGradient(980, 330, 4, 980, 330, 260);
    bounce.addColorStop(0, 'rgba(255,226,184,.28)');
    bounce.addColorStop(1, 'rgba(255,226,184,0)');
    ctx.fillStyle = bounce;
    ctx.fillRect(650, 100, 374, 420);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    if ('environmentIntensity' in scene) scene.environmentIntensity = .9;
    tex.dispose();
    pmrem.dispose();
  })();

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, .1, 160);
  const clock = new THREE.Clock();
  const tmpV = new THREE.Vector3();

  const PALETTE = {
    paper: 0xf2ecdf,
    sand: 0xd6cebb,
    sandLight: 0xe6dfce,
    hill: 0xa4b394,
    hillLight: 0xc2cdad,
    tree: 0x74906b,
    treeDeep: 0x516e58,
    trunk: 0x7d654c,
    block: 0x506064,
    blockLight: 0x6f7e7d,
    steel: 0xb2b4aa,
    steelDark: 0x747d78,
    cast: 0x8c9895,
    piston: 0xd4ccbb,
    sage: 0x7f9782,
    sageDeep: 0x5f7d67,
    bronze: 0x8f6047,
    copper: 0xb8734e,
    rubber: 0x242827,
    bluePipe: 0x397a99,
    accent: 0xd88a42,
    ivory: 0xece4d2
  };

  /* ── materials ────────────────────────────────────────────────────────── */
  const M = {
    block: std(PALETTE.block, { roughness: .56, metalness: .48 }),
    blockLight: std(PALETTE.blockLight, { roughness: .52, metalness: .5 }),
    blockGlass: new THREE.MeshPhysicalMaterial({
      color: 0x9aa7a2, roughness: .18, metalness: .15, transparent: true, opacity: .17,
      depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: .2
    }),
    head: std(0x5f6f6d, { roughness: .48, metalness: .5 }),
    headEdge: std(0x8c9a93, { roughness: .44, metalness: .55 }),
    steel: std(PALETTE.steel, { roughness: .34, metalness: .72 }),
    steelDark: std(PALETTE.steelDark, { roughness: .4, metalness: .66 }),
    cast: std(PALETTE.cast, { roughness: .56, metalness: .44 }),
    castLight: std(0x9aa49e, { roughness: .5, metalness: .4 }),
    piston: std(PALETTE.piston, { roughness: .34, metalness: .62 }),
    pistonSkirt: std(0xaca494, { roughness: .5, metalness: .45 }),
    ring: std(0x343b3a, { roughness: .38, metalness: .65 }),
    rod: std(0x8e9790, { roughness: .3, metalness: .72 }),
    rodDark: std(0x5f6964, { roughness: .38, metalness: .68 }),
    crank: std(0x717b78, { roughness: .3, metalness: .75 }),
    crankDark: std(0x515a57, { roughness: .36, metalness: .7 }),
    sage: std(PALETTE.sage, { roughness: .52, metalness: .3 }),
    sageDeep: std(PALETTE.sageDeep, { roughness: .5, metalness: .26 }),
    bronze: std(PALETTE.bronze, { roughness: .4, metalness: .6 }),
    copper: std(PALETTE.copper, { roughness: .38, metalness: .65 }),
    rubber: std(PALETTE.rubber, { roughness: .9, metalness: .03 }),
    bluePipe: std(PALETTE.bluePipe, { roughness: .55, metalness: .12 }),
    accent: std(PALETTE.accent, { roughness: .46, metalness: .28 }),
    ivory: std(PALETTE.ivory, { roughness: .6, metalness: .05 }),
    brass: std(0xb4935a, { roughness: .34, metalness: .7 }),
    whiteCeramic: std(0xf1e8d5, { roughness: .45, metalness: .02 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xa8b5ac, roughness: .12, metalness: .1, transparent: true, opacity: .2,
      depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: .14
    }),
    coverGhost: new THREE.MeshPhysicalMaterial({
      color: 0x8aa28c, roughness: .3, metalness: .2, transparent: true, opacity: .34,
      depthWrite: false, side: THREE.DoubleSide, clearcoat: .8, clearcoatRoughness: .3
    }),
    coverSolid: std(PALETTE.sage, { roughness: .5, metalness: .28 }),
    ground: std(0xc8d0b3, { roughness: .98, metalness: 0 }),
    platform: std(0xe1d9c7, { roughness: .88, metalness: .03 }),
    platformEdge: std(0xc7bda8, { roughness: .9, metalness: .02 }),
    darkMetal: std(0x3e4744, { roughness: .44, metalness: .6 }),
    orange: std(0xd3863c, { roughness: .45, metalness: .3 })
  };

  function std(color, opts = {}) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color, roughness: .55, metalness: .25
    }, opts));
  }

  function cloneMat(mat, extra = {}) {
    const m = mat.clone();
    Object.assign(m, extra);
    return m;
  }

  /* ── geometry helpers ─────────────────────────────────────────────────── */
  const boxGeoCache = new Map();
  function boxGeo(w, h, d) {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  }

  function mesh(geo, mat, parent, x = 0, y = 0, z = 0, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  function box(w, h, d, mat, parent, x = 0, y = 0, z = 0, cast = true) {
    return mesh(boxGeo(w, h, d), mat, parent, x, y, z, cast);
  }

  function cyl(rt, rb, h, seg, mat, parent, x = 0, y = 0, z = 0, axis = 'y', cast = true) {
    const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, parent, x, y, z, cast);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    return m;
  }

  function roundedRectShape(w, d, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  function roundedBoxGeo(w, h, d, r = .12) {
    const rr = Math.min(r, w / 2 - .001, d / 2 - .001);
    const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, rr), {
      depth: h, bevelEnabled: true, bevelThickness: Math.min(.035, h * .12),
      bevelSize: .03, bevelSegments: 2, curveSegments: 5, steps: 1
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -h / 2, 0);
    geo.computeVertexNormals();
    return geo;
  }

  function rounded(w, h, d, r, mat, parent, x = 0, y = 0, z = 0, cast = true) {
    return mesh(roundedBoxGeo(w, h, d, r), mat, parent, x, y, z, cast);
  }

  function tube(points, radius, mat, parent, segments = 26, radial = 8, cast = true) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radial, false), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  function addEdges(parent, geo, color = 0x9aaba3, opacity = .3, threshold = 24) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, threshold),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    parent.add(edges);
    return edges;
  }

  function bolt(parent, x, y, z, size = .045, rot = 0, mat = M.brass) {
    const b = cyl(size, size, size * .55, 6, mat, parent, x, y, z, 'y', false);
    b.rotation.y = rot;
    b.castShadow = false;
    return b;
  }

  function makeCanvasTexture(width, height, draw) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');
    draw(ctx, width, height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }

  /* ── lights ───────────────────────────────────────────────────────────── */
  const hemi = new THREE.HemisphereLight(0xfff8e8, 0x7d856e, 1.03);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d5, 2.15);
  sun.position.set(10, 15, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 42;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 13;
  sun.shadow.camera.bottom = -10;
  sun.shadow.bias = -.00035;
  sun.shadow.normalBias = .028;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 2.5, 0);

  const fill = new THREE.DirectionalLight(0xc9dcda, .62);
  fill.position.set(-11, 7, -7);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd8b3, 1.15);
  rim.position.set(-3, 8, -13);
  scene.add(rim);

  const ambient = new THREE.AmbientLight(0xfff7e9, .30);
  scene.add(ambient);

  // interior fill so the cutaway reads through the smoked front pane
  const innerWarm = new THREE.PointLight(0xffdca8, 1.65, 5.2, 2);
  innerWarm.position.set(0, 3.15, .25);
  scene.add(innerWarm);
  const innerCool = new THREE.PointLight(0xc7e0de, 1.25, 4.2, 2);
  innerCool.position.set(0, 2.15, .45);
  scene.add(innerCool);
  const cutFill = new THREE.PointLight(0xffe2bd, 2.15, 6.5, 2);
  cutFill.position.set(-.2, 2.9, 3.2);
  scene.add(cutFill);

  /* ── environment ──────────────────────────────────────────────────────── */
  const env = new THREE.Group();
  scene.add(env);

  // stippled lawn and brushed concrete textures
  const grassTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#9fb180';
    ctx.fillRect(0, 0, w, h);
    // broad mowing bands
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(172,188,140,.20)' : 'rgba(116,141,96,.13)';
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-.5);
      ctx.fillRect(-w, -h + i * h / 4, w * 2, h / 8);
      ctx.restore();
    }
    const colors = ['rgba(116,139,91,.30)', 'rgba(182,196,151,.28)', 'rgba(92,120,80,.18)', 'rgba(201,210,170,.22)'];
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 42, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = colors[i % colors.length];
      const x = Math.random() * w, y = Math.random() * h;
      const s = Math.random() * 2.2 + .5;
      ctx.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 160; i++) {
      ctx.strokeStyle = 'rgba(92,116,78,.20)';
      ctx.lineWidth = .7;
      const x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - .5) * 4, y - Math.random() * 5); ctx.stroke();
    }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(10, 10);
  M.ground.map = grassTex;
  M.ground.color.set(0xffffff);
  M.ground.needsUpdate = true;

  const concreteTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ded6c4';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 650; i++) {
      const a = .04 + Math.random() * .08;
      ctx.fillStyle = `rgba(95,85,65,${a})`;
      const x = Math.random() * w, y = Math.random() * h;
      ctx.fillRect(x, y, Math.random() * 2 + .5, Math.random() * 2 + .5);
    }
  });
  concreteTex.wrapS = concreteTex.wrapT = THREE.RepeatWrapping;
  concreteTex.repeat.set(3, 3);
  M.platform.map = concreteTex;
  M.platform.color.set(0xffffff);
  M.platform.needsUpdate = true;

  // far ground
  const ground = mesh(new THREE.CircleGeometry(80, 72), M.ground, env, 0, -.02, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  // soft field patches
  for (let i = 0; i < 7; i++) {
    const g = new THREE.CircleGeometry(6 + i * 1.8, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: i % 2 ? 0x9caf80 : 0xb4c197, roughness: 1, metalness: 0,
      transparent: true, opacity: .26, depthWrite: false
    });
    const patch = mesh(g, mat, env, -18 + i * 7, -.005 + i * .0002, -12 + (i % 3) * 7);
    patch.rotation.x = -Math.PI / 2;
    patch.receiveShadow = false;
  }

  // winding service road behind the display plinth
  const roadPts = [
    [-40, .025, -23], [-26, .025, -16], [-12, .025, -11.5],
    [2, .025, -14], [16, .025, -11], [30, .025, -16], [42, .025, -24]
  ];
  const roadGroup = new THREE.Group();
  env.add(roadGroup);
  const road = tube(roadPts, .92, std(0xb9b09a, { roughness: 1, metalness: 0 }), roadGroup, 90, 8, false);
  road.scale.y = .022;
  road.receiveShadow = true;
  const dashMat = std(0xe7dfcf, { roughness: .9, metalness: 0 });
  for (let i = 0; i < 30; i++) {
    const u = (i + .5) / 30;
    const p = new THREE.Vector3().fromArray(roadPts[0]);
    const curve = new THREE.CatmullRomCurve3(roadPts.map(a => new THREE.Vector3(a[0], a[1], a[2])));
    const pos = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const dash = box(.62, .012, .085, dashMat, roadGroup, pos.x, .055, pos.z, false);
    dash.rotation.y = Math.atan2(tan.x, tan.z);
  }

  // distant hills
  const hills = new THREE.Group();
  env.add(hills);
  makeHill(-16, -1.6, -27, 22, 4.4, 9, 0x93a982);
  makeHill(2, -2.2, -32, 30, 6.2, 12, 0xa6b790);
  makeHill(22, -1.2, -25, 19, 3.6, 8, 0x8ca07c);
  makeHill(-33, -.6, -16, 17, 3.0, 7, 0xa3b48f);
  makeHill(34, -.2, -15, 16, 2.4, 6.5, 0x9cad86);

  function makeHill(x, y, z, sx, sy, sz, color) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true });
    const h = mesh(new THREE.SphereGeometry(1, 28, 14), mat, hills, x, y, z, false);
    h.scale.set(sx, sy, sz);
    h.receiveShadow = false;
    return h;
  }

  // low-poly trees
  const trees = new THREE.Group();
  env.add(trees);
  const trunkMat = std(PALETTE.trunk, { roughness: .95, flatShading: true });
  const leafMats = [
    std(0x57774d, { roughness: .95, flatShading: true }),
    std(0x6b895d, { roughness: .95, flatShading: true }),
    std(0x456747, { roughness: .95, flatShading: true }),
    std(0x7d9768, { roughness: .95, flatShading: true })
  ];
  const treeLayout = [
    [-16.0, -12.0, 1.75], [-9.2, -17.5, 1.55], [7.8, -16.0, 1.75],
    [16.0, -9.5, 2.0], [19.0, 3.0, 1.55], [-18.0, 4.0, 1.7],
    [-13.0, 13.0, 1.35], [14.0, 13.5, 1.35], [0, -22.0, 1.3],
    [22.0, -16.0, 1.2], [-24.0, -7.0, 1.25],
    [-31.0, -22.0, 1.1], [-21.0, -26.0, 1.2], [-9.0, -27.5, 1.05],
    [8.0, -28.0, 1.1], [18.0, -25.0, 1.15], [28.0, -21.0, 1.05]
  ];
  treeLayout.forEach((t, i) => makeTree(t[0], t[1], t[2], i));

  function makeTree(x, z, s, i) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    trees.add(g);
    const trunk = cyl(.075 * s, .12 * s, 1.35 * s, 7, trunkMat, g, 0, .67 * s, 0);
    trunk.rotation.z = (i % 2 ? 1 : -1) * .035;
    const canopy = new THREE.Group();
    canopy.position.y = 1.55 * s;
    g.add(canopy);
    const base = new THREE.IcosahedronGeometry(1, 1);
    const c1 = mesh(base, leafMats[i % leafMats.length], canopy, 0, 0, 0);
    c1.scale.set(1.04 * s, .9 * s, 1.02 * s);
    const c2 = mesh(base, leafMats[(i + 1) % leafMats.length], canopy, -.55 * s, -.1 * s, .2 * s);
    c2.scale.set(.58 * s, .54 * s, .58 * s);
    const c3 = mesh(base, leafMats[(i + 2) % leafMats.length], canopy, .52 * s, -.22 * s, -.18 * s);
    c3.scale.set(.52 * s, .48 * s, .52 * s);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // dense low-poly tree line behind the display
  const forest = new THREE.Group();
  env.add(forest);
  for (let i = 0; i < 17; i++) {
    const x = -27 + i * 3.35 + Math.sin(i * 1.71) * 1.1;
    const z = -19.5 - (i % 4) * 1.35;
    const s = .78 + (i % 5) * .1;
    const trunk = cyl(.09 * s, .13 * s, 1.2 * s, 6, trunkMat, forest, x, .6 * s, z);
    const canopy = new THREE.Group();
    canopy.position.set(x, 1.35 * s, z);
    forest.add(canopy);
    const mat = leafMats[i % leafMats.length];
    const b1 = mesh(new THREE.IcosahedronGeometry(1, 1), mat, canopy, 0, 0, 0, false);
    b1.scale.set(1.0 * s, .78 * s, .95 * s);
    const b2 = mesh(new THREE.IcosahedronGeometry(1, 0), leafMats[(i + 2) % leafMats.length], canopy, .45 * s, -.15 * s, .15 * s, false);
    b2.scale.set(.52 * s, .46 * s, .52 * s);
    forest.children.forEach(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // tufts at the edge of the plinth
  const tuftMat = leafMats[1];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + .2;
    const r = 7.65 + (i % 3) * .32;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, .02, Math.sin(a) * r);
    env.add(g);
    for (let j = 0; j < 3; j++) {
      const h = .12 + (j % 2) * .09 + (i % 3) * .03;
      const blade = mesh(new THREE.ConeGeometry(.035, h, 3), tuftMat, g, (j - 1) * .07, h / 2, (j % 2) * .07, false);
      blade.rotation.z = (j - 1) * .28;
    }
  }

  // shrubs near the plinth
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + .3;
    const r = 9.5 + (i % 3) * .7;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    env.add(g);
    const mat = leafMats[i % leafMats.length];
    for (let j = 0; j < 3; j++) {
      const b = mesh(new THREE.IcosahedronGeometry(.19 + (j % 2) * .06, 0), mat, g,
        Math.cos(j * 2.1) * .21, .14 + (j % 2) * .06, Math.sin(j * 2.1) * .21);
      b.scale.y = .7;
      b.castShadow = true;
      b.receiveShadow = true;
    }
  }

  // plinth
  const plinth = new THREE.Group();
  env.add(plinth);
  const plinthBase = cyl(7.05, 7.42, .48, 84, M.platform, plinth, 0, .3, 0);
  plinthBase.receiveShadow = true;
  plinthBase.castShadow = true;
  const plinthRim = cyl(7.1, 7.1, .075, 84, M.platformEdge, plinth, 0, .56, 0);
  plinthRim.receiveShadow = true;

  // concentric etched rings
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9b927e, transparent: true, opacity: .30, depthWrite: false });
  [7.0, 6.24, 5.62, 4.1].forEach((r, i) => {
    const ring = mesh(new THREE.RingGeometry(r - .012, r + .012, 128), ringMat, plinth, 0, .567, 0, false);
    ring.rotation.x = -Math.PI / 2;
    ring.material.opacity = i === 1 ? .38 : .20;
  });

  // radial ticks
  const tickPts = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const r1 = i % 4 === 0 ? 6.62 : 6.82;
    const r2 = 7.02;
    tickPts.push(Math.cos(a) * r1, .569, Math.sin(a) * r1, Math.cos(a) * r2, .569, Math.sin(a) * r2);
  }
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3));
  const ticks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({
    color: 0x948b77, transparent: true, opacity: .28, depthWrite: false
  }));
  plinth.add(ticks);

  // long shadow-catching base / engine display plinth
  const displayBase = rounded(8.0, .13, 3.7, .18, M.darkMetal, env, 0, .63, 0);
  displayBase.receiveShadow = true;
  displayBase.castShadow = false;
  // brushed top
  const displayTop = rounded(7.82, .035, 3.52, .16, M.steelDark, env, 0, .706, 0, false);
  displayTop.receiveShadow = true;

  // display plate text
  const brandTex = makeCanvasTexture(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(40,55,45,.78)';
    ctx.textAlign = 'center';
    ctx.font = '700 54px "Cascadia Mono", Consolas, monospace';
    ctx.letterSpacing = '8px';
    ctx.fillText('DYNAMIC HEART', w / 2, 104);
    ctx.font = '500 25px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(55,72,60,.52)';
    ctx.fillText('I4  ·  1.5 TURBO  ·  DOHC 16V', w / 2, 154);
    ctx.strokeStyle = 'rgba(55,72,60,.20)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w / 2 - 240, 184); ctx.lineTo(w / 2 + 240, 184); ctx.stroke();
  });
  const brandPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, .75),
    new THREE.MeshBasicMaterial({ map: brandTex, transparent: true, depthWrite: false })
  );
  brandPlate.rotation.x = -Math.PI / 2;
  brandPlate.position.set(0, .726, 2.72);
  env.add(brandPlate);

  // surface contact shadow
  const contactTexture = makeCanvasTexture(256, 256, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(43,38,28,.34)');
    grd.addColorStop(.55, 'rgba(43,38,28,.13)');
    grd.addColorStop(1, 'rgba(43,38,28,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  });
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 7.2),
    new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, opacity: .55 })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = .725;
  env.add(contact);

  /* ── engine assembly ──────────────────────────────────────────────────── */
  const engine = new THREE.Group();
  scene.add(engine);

  const CYL = [-2.25, -.75, .75, 2.25];
  const CRANK_Y = 1.95;
  const CRANK_R = .45;
  const ROD_L = 1.2;
  const DECK_Y = 3.9;

  const anchors = {};
  const pickables = [];
  const moving = {
    pistons: [], rods: [], throws: [], valves: [], cams: [], plugs: [],
    sparks: [], flames: [], gases: [], linersFull: [], linersCut: [],
    timingGears: [], timingChain: null, turboWheel: null, fanWheel: null
  };

  const M2 = {
    sleeve: cloneMat(M.steel, { side: THREE.FrontSide, roughness: .3, metalness: .72 }),
    sleeveCut: cloneMat(M.steel, { side: THREE.DoubleSide, roughness: .36, metalness: .66, color: 0x989a8f }),
    sleeveInner: std(0x242b2a, { roughness: .7, metalness: .35, side: THREE.DoubleSide }),
    port: std(0x192020, { roughness: .8, metalness: .2, side: THREE.DoubleSide }),
    cutEdge: std(0xbf8a58, { roughness: .38, metalness: .58 }),
    chain: std(0x4b5351, { roughness: .42, metalness: .72 }),
    belt: std(0x232726, { roughness: .88, metalness: .05 }),
    carbon: std(0x2d3331, { roughness: .75, metalness: .15 }),
    plastic: std(0x2e3835, { roughness: .62, metalness: .1 }),
    heatShield: std(0xa8a99b, { roughness: .42, metalness: .58 })
  };

  function anchor(parent, key, x, y, z) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    anchors[key] = o;
    return o;
  }

  // ── engine stand ──
  const stand = new THREE.Group();
  engine.add(stand);
  [-2.15, 2.15].forEach((x, i) => {
    const pedestal = rounded(.44, .32, 1.18, .08, M.darkMetal, stand, x, .885, 0);
    pedestal.castShadow = true;
    box(.64, .07, 1.34, M.steelDark, stand, x, .735, 0);
    const bushing = cyl(.18, .18, .9, 18, M.orange, stand, x, 1.04, 0, 'z', false);
    bushing.castShadow = false;
    [1, -1].forEach(side => {
      bolt(stand, x, 1.04, side * .47, .04, 0, M.brass);
    });
    // diagonal brace
    const brace = box(.12, .4, .12, M.steelDark, stand, x + (i ? -.24 : .24), .78, .5);
    brace.rotation.z = i ? .4 : -.4;
  });

  // ── oil pan ──
  const panGroup = new THREE.Group();
  engine.add(panGroup);
  rounded(5.45, .46, 1.86, .22, M.block, panGroup, 0, 1.38, 0);
  rounded(4.5, .17, 1.58, .16, M.blockLight, panGroup, 0, 1.08, 0);
  // sump ribs
  for (let i = 0; i < 7; i++) {
    box(.075, .22, 1.3, M.block, panGroup, -1.8 + i * .6, 1.03, 0, false);
  }
  // oil drain plug
  cyl(.09, .09, .08, 12, M.brass, panGroup, 2.05, 1.0, 0);
  // oil level / temp sensor
  cyl(.055, .055, .16, 10, M.steelDark, panGroup, -1.6, 1.26, .92, 'y');
  // pan rails
  box(5.4, .08, .1, M.steelDark, panGroup, 0, 1.58, .92);
  box(5.4, .08, .1, M.steelDark, panGroup, 0, 1.58, -.92);
  // bolts around pan rail
  for (let i = 0; i < 7; i++) {
    bolt(panGroup, -2.4 + i * .8, 1.61, 1.02, .038);
    bolt(panGroup, -2.4 + i * .8, 1.61, -1.02, .038);
  }

  // ── cylinder block / crankcase ──
  const blockGroup = new THREE.Group();
  engine.add(blockGroup);

  // open-front crankcase: rear wall, side cheeks and a low sill
  rounded(6.58, .66, .24, .08, M.block, blockGroup, 0, 1.82, -1.0);
  rounded(6.58, .2, .24, .06, M.block, blockGroup, 0, 1.6, 1.0);
  rounded(.3, .66, 2.3, .09, M.block, blockGroup, -3.14, 1.82, 0);
  rounded(.3, .66, 2.3, .09, M.block, blockGroup, 3.14, 1.82, 0);
  // rear crankcase ribs
  for (let i = 0; i < 7; i++) {
    box(.1, .48, .055, M.blockLight, blockGroup, -2.7 + i * .9, 1.82, -1.155, false);
    bolt(blockGroup, -2.7 + i * .9, 1.95, -1.19, .035, 0, M.steelDark);
  }
  // main bearing caps peeking out
  for (let i = 0; i < 5; i++) {
    box(.3, .34, .2, M.steelDark, blockGroup, -3.0 + i * 1.5, 1.65, -.86, false);
    bolt(blockGroup, -3.0 + i * 1.5, 1.56, -.96, .04, 0, M.brass);
  }
  // visible main-bearing saddles inside the cutaway crankcase
  [-1.5, 0, 1.5].forEach(x => {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(.26, .065, 6, 18, Math.PI), M.steelDark);
    arch.position.set(x, CRANK_Y, 0);
    arch.rotation.y = Math.PI / 2;
    arch.castShadow = true;
    arch.receiveShadow = true;
    blockGroup.add(arch);
    [-.26, .26].forEach(z => {
      box(.13, .42, .1, M.steelDark, blockGroup, x, 1.74, z, false);
      bolt(blockGroup, x, 1.58, z + .12, .03, 0, M.brass);
    });
  });

  // side walls
  rounded(6.34, 1.8, .26, .1, M.block, blockGroup, 0, 2.98, -1.0);
  rounded(.3, 1.8, 2.15, .09, M.block, blockGroup, -3.1, 2.98, 0);
  rounded(.3, 1.8, 2.15, .09, M.block, blockGroup, 3.1, 2.98, 0);
  // cast front wall with four bored windows, open crankcase below
  const frontWallShape = roundedRectShape(6.36, 1.52, .1);
  CYL.forEach(x => {
    const hole = new THREE.Path();
    hole.absarc(x, 0, .685, 0, Math.PI * 2, true);
    frontWallShape.holes.push(hole);
  });
  const frontWallGeo = new THREE.ExtrudeGeometry(frontWallShape, {
    depth: .18, bevelEnabled: false, steps: 1, curveSegments: 32
  });
  const frontWall = mesh(frontWallGeo, M.block, blockGroup, 0, 3.18, .92);
  frontWall.receiveShadow = true;
  addEdges(frontWall, frontWallGeo, 0x8c9a94, .34, 30);
  CYL.forEach(x => {
    const rim = mesh(new THREE.TorusGeometry(.692, .017, 6, 30), M.steelDark, blockGroup, x, 3.18, 1.112, false);
    [45, 135, 225, 315].forEach(deg => {
      const a = deg * Math.PI / 180;
      cyl(.031, .031, .028, 6, M.brass, blockGroup, x + Math.cos(a) * .73, 3.18 + Math.sin(a) * .73, 1.112, 'z', false);
    });
  });

  // full-height glazing for the closed (non-cutaway) view
  const frontGlass = rounded(6.34, 2.18, .045, .05, M.blockGlass, blockGroup, 0, 2.81, 1.16, false);
  addEdges(frontGlass, frontGlass.geometry, 0x9aada5, .42, 20);
  // solid front cover shown when the cutaway is switched off
  const frontCoverGroup = new THREE.Group();
  frontCoverGroup.visible = false;
  blockGroup.add(frontCoverGroup);
  const frontSolid = rounded(6.38, 2.18, .12, .06, M.block, frontCoverGroup, 0, 2.81, 1.22, false);
  addEdges(frontSolid, frontSolid.geometry, 0x87968f, .28, 28);
  const frontRecess = rounded(5.86, 1.46, .055, .09, M.blockLight, frontCoverGroup, 0, 2.83, 1.285, false);
  for (let i = 0; i < 6; i++) {
    box(.075, 1.62, .045, M.block, frontCoverGroup, -2.35 + i * .94, 2.82, 1.29, false);
  }
  for (let i = 0; i < 8; i++) {
    bolt(frontCoverGroup, -2.85 + i * .815, 3.79, 1.295, .03, 0, M.steelDark);
    bolt(frontCoverGroup, -2.85 + i * .815, 1.84, 1.295, .03, 0, M.steelDark);
  }
  const frontPlateTex = makeCanvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(40,55,45,.78)';
    ctx.font = '700 36px "Cascadia Mono", Consolas, monospace';
    ctx.letterSpacing = '4px';
    ctx.fillText('1.5 TURBO  I4', w / 2, 58);
    ctx.fillStyle = 'rgba(40,55,45,.45)';
    ctx.font = '500 18px "Microsoft YaHei", sans-serif';
    ctx.fillText('DYNAMIC HEART  ·  16 VALVE', w / 2, 88);
  });
  const frontPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.75, .44),
    new THREE.MeshBasicMaterial({ map: frontPlateTex, transparent: true, depthWrite: false })
  );
  frontPlate.position.set(1.75, 2.22, 1.3);
  frontCoverGroup.add(frontPlate);

  // section cut faces
  box(6.38, .045, .07, M2.cutEdge, blockGroup, 0, 1.7, 1.08, false);
  box(6.38, .045, .07, M2.cutEdge, blockGroup, 0, 3.9, 1.08, false);
  box(.045, 2.22, .07, M2.cutEdge, blockGroup, -3.18, 2.8, 1.08, false);
  box(.045, 2.22, .07, M2.cutEdge, blockGroup, 3.18, 2.8, 1.08, false);

  // block top deck with four bores
  const deckShape = roundedRectShape(6.36, 2.18, .13);
  CYL.forEach(x => {
    const hole = new THREE.Path();
    hole.absarc(x, 0, .585, 0, Math.PI * 2, true);
    deckShape.holes.push(hole);
  });
  const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
    depth: .1, bevelEnabled: false, steps: 1, curveSegments: 32
  });
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.translate(0, 3.82, 0);
  const deck = mesh(deckGeo, M.block, blockGroup, 0, 0, 0);
  deck.receiveShadow = true;
  addEdges(deck, deckGeo, 0x8c9a94, .26, 30);

  // cylinder sleeves: full liners for the closed view, half liners for the cutaway
  const cutSleeveGeo = new THREE.CylinderGeometry(.577, .577, 1.44, 30, 1, true, Math.PI / 2, Math.PI);
  CYL.forEach((x, i) => {
    const liner = cyl(.575, .575, 1.44, 30, M2.sleeve, blockGroup, x, 3.18, 0, 'y', false);
    liner.receiveShadow = true;
    const linerInner = cyl(.535, .535, 1.45, 28, M2.sleeveInner, blockGroup, x, 3.18, 0, 'y', false);
    moving.linersFull.push(liner, linerInner);

    const cut = mesh(cutSleeveGeo, M2.sleeveCut, blockGroup, x, 3.18, 0, false);
    cut.receiveShadow = true;
    moving.linersCut.push(cut);
    [-1, 1].forEach(side => {
      box(.022, 1.44, .022, M2.cutEdge, blockGroup, x + side * .577, 3.18, 0, false);
    });

    const lip = mesh(new THREE.TorusGeometry(.57, .036, 8, 30), M.steelDark, blockGroup, x, 3.9, 0);
    lip.rotation.x = Math.PI / 2;
    // coolant jacket hint
    const ring = mesh(new THREE.TorusGeometry(.635, .022, 6, 24), M2.cutEdge, blockGroup, x, 2.58, 0, false);
    ring.rotation.x = Math.PI / 2;
  });

  // oil filter
  const filter = cyl(.23, .23, .56, 18, M.bluePipe, blockGroup, -2.95, 1.53, 1.03);
  filter.rotation.z = .03;
  cyl(.235, .235, .09, 18, M.steelDark, blockGroup, -2.95, 1.81, 1.03);
  for (let i = 0; i < 5; i++) {
    const r = mesh(new THREE.TorusGeometry(.232, .008, 4, 16), M.steelDark, blockGroup, -2.95, 1.32 + i * .1, 1.03, false);
    r.rotation.x = Math.PI / 2;
  }
  // dipstick tube
  const dipTube = cyl(.022, .022, .55, 8, M.steel, blockGroup, 2.73, 2.3, 1.02);
  dipTube.rotation.z = -.13;
  const dipLoop = mesh(new THREE.TorusGeometry(.095, .02, 7, 16), M.orange, blockGroup, 2.7, 2.61, 1.02);
  dipLoop.rotation.y = Math.PI / 2;

  // block casting bolts
  for (let i = 0; i < 8; i++) {
    bolt(blockGroup, -2.8 + i * .8, 2.48, 1.14, .032, 0, M.steelDark);
  }

  // ── cylinder head ──
  const headGroup = new THREE.Group();
  engine.add(headGroup);
  rounded(6.42, .43, 2.18, .1, M.head, headGroup, 0, 4.105, 0);
  box(6.46, .04, 2.23, M2.cutEdge, headGroup, 0, 3.9, 0, false);
  // head deck / cam carrier
  [-1, 1].forEach(side => {
    rounded(5.85, .17, .3, .07, M.headEdge, headGroup, 0, 4.35, side * .52);
    for (let i = 0; i < 5; i++) {
      box(.3, .12, .34, M.head, headGroup, -2.7 + i * 1.35, 4.42, side * .52, false);
      bolt(headGroup, -2.7 + i * 1.35, 4.49, side * .52, .032, 0, M.brass);
    }
  });
  for (let i = 0; i < 8; i++) {
    bolt(headGroup, -2.8 + i * .8, 4.33, .97, .034, 0, M.brass);
    bolt(headGroup, -2.8 + i * .8, 4.33, -.97, .034, 0, M.brass);
  }
  // intake / exhaust port stubs
  CYL.forEach(x => {
    cyl(.17, .17, .22, 18, M2.port, headGroup, x, 3.98, -.99, 'z', false);
    cyl(.145, .145, .22, 18, M2.port, headGroup, x, 3.95, .99, 'z', false);
    const flangeI = cyl(.21, .21, .05, 18, M.castLight, headGroup, x, 3.98, -1.1, 'z', false);
    const flangeE = cyl(.185, .185, .05, 18, M.bronze, headGroup, x, 3.95, 1.1, 'z', false);
  });

  // ── solid valve cover (hidden in cutaway) + always-visible coil rail ──
  const coverGroup = new THREE.Group();
  engine.add(coverGroup);
  const coverBody = rounded(6.35, .52, 2.12, .18, M.coverSolid, coverGroup, 0, 4.67, 0, false);
  addEdges(coverBody, coverBody.geometry, 0x536f5a, .3, 24);
  // gasket
  box(6.38, .04, 2.15, M2.carbon, coverGroup, 0, 4.42, 0, false);
  // raised top ribs
  for (let i = 0; i < 6; i++) {
    box(.09, .028, 1.84, M.sageDeep, coverGroup, -2.3 + i * .92, 4.94, 0, false);
  }
  // oil filler cap
  cyl(.14, .14, .07, 18, M.orange, coverGroup, 2.55, 4.95, .52);
  const capTop = cyl(.105, .105, .02, 18, M.brass, coverGroup, 2.55, 4.995, .52);

  // exposed ignition rail and coil packs (they sit above the intake-side cam)
  const coilsGroup = new THREE.Group();
  headGroup.add(coilsGroup);
  box(5.85, .06, .3, M2.carbon, coilsGroup, 0, 4.77, -.52, false);
  for (let i = 0; i < 4; i++) {
    const coil = rounded(.4, .15, .3, .05, M2.plastic, coilsGroup, CYL[i], 4.88, -.52);
    box(.15, .06, .16, M.steelDark, coilsGroup, CYL[i], 4.962, -.52, false);
    cyl(.045, .045, .11, 10, M.rubber, coilsGroup, CYL[i], 4.805, -.42);
    // short HT lead
    tube([[CYL[i], 4.96, -.52], [CYL[i] + .1, 5.01, -.66], [CYL[i] + .18, 4.98, -.78]], .012, M2.rubber, coilsGroup, 8, 4, false);
  }
  box(5.2, .035, .035, M2.rubber, coilsGroup, 0, 5.0, -.78, false);

  // cam bearing saddles visible when the cover is lifted
  [-.52, .52].forEach(z => {
    [-2.9, -1.5, 0, 1.5, 2.9].forEach(x => {
      rounded(.34, .12, .36, .045, M.steelDark, headGroup, x, 4.66, z);
      bolt(headGroup, x - .1, 4.73, z + .13, .024, 0, M.brass);
      bolt(headGroup, x + .1, 4.73, z + .13, .024, 0, M.brass);
    });
  });
  // cover badge
  const badgeTex = makeCanvasTexture(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(246,239,222,.94)';
    ctx.font = '700 72px "Cascadia Mono", Consolas, monospace';
    ctx.letterSpacing = '10px';
    ctx.fillText('E·TURBO', w / 2, 112);
    ctx.font = '500 28px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(238,231,211,.62)';
    ctx.letterSpacing = '6px';
    ctx.fillText('1.5 T  /  DOHC 16V', w / 2, 166);
    ctx.strokeStyle = 'rgba(238,231,211,.36)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w / 2 - 210, 196); ctx.lineTo(w / 2 + 210, 196); ctx.stroke();
  });
  const badge = rounded(1.78, .035, .42, .06, M.sageDeep, coverGroup, -.45, 4.945, .08);
  const badgeFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.66, .38),
    new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, depthWrite: false })
  );
  badgeFace.rotation.x = -Math.PI / 2;
  badgeFace.position.set(-.45, 4.965, .08);
  coverGroup.add(badgeFace);

  // ── camshafts ──
  function lobeGeometry() {
    const shape = new THREE.Shape();
    const pts = [];
    for (let i = 0; i <= 56; i++) {
      const a = i / 56 * Math.PI * 2;
      const bump = Math.pow(Math.max(0, Math.cos(a)), 4);
      const r = .092 + .078 * bump;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: .11, bevelEnabled: true, bevelThickness: .012, bevelSize: .012,
      bevelSegments: 1, steps: 1, curveSegments: 4
    });
    geo.translate(0, 0, -.055);
    geo.rotateY(Math.PI / 2);
    return geo;
  }
  const lobeGeo = lobeGeometry();

  [-.52, .52].forEach((z, sideIdx) => {
    const cam = new THREE.Group();
    cam.position.set(0, 4.56, z);
    headGroup.add(cam);
    cyl(.072, .072, 5.96, 16, M.steel, cam, 0, 0, 0, 'x');
    CYL.forEach((x, i) => {
      const lobe = mesh(lobeGeo, M.steelDark, cam, x, 0, 0);
      lobe.rotation.x = i * 1.05 + sideIdx * .48;
      const collar = cyl(.088, .088, .04, 12, M.brass, cam, x - .18, 0, 0, 'x', false);
    });
    // front / rear bearing journals
    [-2.9, 2.9].forEach(x => cyl(.1, .1, .13, 14, M.cast, cam, x, 0, 0, 'x', false));
    moving.cams.push(cam);
  });

  // ── valves: 16 valves, 4 per cylinder ──
  const valvePositions = [];
  CYL.forEach((cx, ci) => {
    [-1, 1].forEach(side => {
      [0, 1].forEach(j => {
        valvePositions.push({
          x: cx + (j ? -.17 : .17),
          z: side * (.18 + j * .18),
          ci, side, j
        });
      });
    });
  });

  const valveBaseY = 4.24;
  valvePositions.forEach(vp => {
    const root = new THREE.Group();
    root.position.set(vp.x, valveBaseY, vp.z);
    headGroup.add(root);

    const valve = new THREE.Group();
    root.add(valve);
    cyl(.026, .026, .64, 8, M.steel, valve, 0, .1, 0, 'y', false);
    cyl(.13, .102, .06, 16, M.steelDark, valve, 0, -.22, 0, 'y', false);
    const retainer = cyl(.085, .085, .035, 12, M.steel, valve, 0, .38, 0, 'y', false);
    const bucket = cyl(.1, .1, .13, 14, M.steelDark, valve, 0, .44, 0, 'y', false);
    // spring
    const spring = new THREE.Group();
    root.add(spring);
    for (let s = 0; s < 4; s++) {
      const ring = mesh(new THREE.TorusGeometry(.082, .012, 5, 14), M.steel, spring, 0, .08 + s * .075, 0, false);
      ring.rotation.x = Math.PI / 2;
    }
    moving.valves.push({ group: valve, spring, ...vp });
  });

  // ── spark plugs / ignition ──
  const flashTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,246,210,1)');
    g.addColorStop(.16, 'rgba(255,196,110,.95)');
    g.addColorStop(.46, 'rgba(255,126,48,.30)');
    g.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const flameTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    // irregular flame lobes
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + Math.sin(i * 2.7) * .18;
      const dist = w * (.1 + (i % 3) * .045);
      const lx = cx + Math.cos(a) * dist;
      const ly = cy + Math.sin(a) * dist;
      const radius = w * (.11 + (i % 4) * .025);
      const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, radius);
      lg.addColorStop(0, 'rgba(255,246,196,.92)');
      lg.addColorStop(.35, 'rgba(255,188,72,.72)');
      lg.addColorStop(.72, 'rgba(247,98,27,.25)');
      lg.addColorStop(1, 'rgba(220,55,15,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(lx, ly, radius, 0, Math.PI * 2); ctx.fill();
    }
    // bright detonation core
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * .42);
    core.addColorStop(0, 'rgba(255,255,248,1)');
    core.addColorStop(.1, 'rgba(255,250,210,1)');
    core.addColorStop(.26, 'rgba(255,220,122,.96)');
    core.addColorStop(.5, 'rgba(255,143,48,.60)');
    core.addColorStop(.78, 'rgba(236,74,19,.16)');
    core.addColorStop(1, 'rgba(225,55,14,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);
    // flying sparks
    ctx.shadowColor = 'rgba(255,185,100,.9)';
    ctx.shadowBlur = 8;
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + (i % 2) * .12;
      const dist = w * (.25 + (i % 5) * .035);
      ctx.fillStyle = i % 3 ? 'rgba(255,238,175,.92)' : 'rgba(255,255,240,1)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, 1.2 + (i % 3) * .8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });

  const starTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = 'rgba(255,190,110,.9)';
    ctx.shadowBlur = 22;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      const len = w * (i % 3 === 0 ? .47 : .34);
      const grad = ctx.createLinearGradient(0, 0, 0, -len);
      grad.addColorStop(0, 'rgba(255,255,246,.98)');
      grad.addColorStop(.28, 'rgba(255,237,174,.80)');
      grad.addColorStop(1, 'rgba(255,166,64,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-2.2, 0);
      ctx.lineTo(0, -len);
      ctx.lineTo(2.2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * .22);
    core.addColorStop(0, 'rgba(255,255,252,1)');
    core.addColorStop(.22, 'rgba(255,246,196,1)');
    core.addColorStop(.6, 'rgba(255,187,84,.6)');
    core.addColorStop(1, 'rgba(255,140,48,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);
  });

  const ringTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.shadowColor = 'rgba(255,146,64,.9)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = 'rgba(255,227,173,.95)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy, w * .35, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,238,.62)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, w * .3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,174,90,.38)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const r1 = w * .37, r2 = w * (.4 + (i % 3) * .022);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }
  });

  CYL.forEach((cx, i) => {
    const root = new THREE.Group();
    root.position.set(cx, 4.3, .02);
    headGroup.add(root);
    cyl(.078, .078, .075, 6, M.steelDark, root, 0, .02, 0, 'y', false);
    const ceramic = cyl(.052, .063, .23, 12, M.whiteCeramic, root, 0, .17, 0, 'y', false);
    cyl(.026, .026, .055, 8, M.brass, root, 0, .31, 0, 'y', false);
    cyl(.02, .02, .28, 6, M.steelDark, root, 0, -.17, 0, 'y', false);
    const tipMat = cloneMat(M.brass, {
      emissive: new THREE.Color(0xff7a32), emissiveIntensity: .0
    });
    const tip = mesh(new THREE.SphereGeometry(.034, 10, 8), tipMat, root, 0, -.34, 0, false);

    const flashMat = new THREE.SpriteMaterial({
      map: flashTex, color: 0xffb15c, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const flash = new THREE.Sprite(flashMat);
    flash.position.set(0, -.35, 0);
    flash.scale.set(.95, .95, 1);
    root.add(flash);

    const light = new THREE.PointLight(0xff9b4e, 0, 2.2, 2);
    light.position.set(cx, 3.94, 0);
    headGroup.add(light);

    const flameMat = new THREE.SpriteMaterial({
      map: flameTex, color: 0xffb15c, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const flame = new THREE.Sprite(flameMat);
    flame.position.set(cx, 3.72, .58);
    flame.scale.set(1.2, 1.08, 1);
    flame.renderOrder = 4;
    engine.add(flame);

    // hot flash visible through the circular cutaway window
    const glowMat = new THREE.SpriteMaterial({
      map: flameTex, color: 0xffc481, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(cx, 3.18, 1.135);
    glow.scale.set(1.1, 1.1, 1);
    glow.renderOrder = 5;
    engine.add(glow);

    // expanding pressure ring
    const ringMat = new THREE.SpriteMaterial({
      map: ringTex, color: 0xffc06f, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Sprite(ringMat);
    ring.position.set(cx, 3.18, 1.16);
    ring.scale.set(.7, .7, 1);
    ring.renderOrder = 6;
    engine.add(ring);

    // soft outer fireball that licks around the cutaway window
    const flareMat = new THREE.SpriteMaterial({
      map: flameTex, color: 0xff7a2d, transparent: true, opacity: 0,
      blending: THREE.NormalBlending, depthWrite: false
    });
    const flare = new THREE.Sprite(flareMat);
    flare.position.set(cx, 3.18, 1.41);
    flare.scale.set(1.4, 1.4, 1);
    flare.renderOrder = 4;
    engine.add(flare);

    // sharp star flash at the instant of ignition
    const starMat = new THREE.SpriteMaterial({
      map: starTex, color: 0xffd18b, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const star = new THREE.Sprite(starMat);
    star.position.set(cx, 3.18, 1.45);
    star.scale.set(1.5, 1.5, 1);
    star.renderOrder = 7;
    engine.add(star);

    moving.plugs.push({ root, tipMat, flash: flashMat, flashSprite: flash, light });
    moving.flames.push({ mat: flameMat, sprite: flame, glowMat, glow, ringMat, ring, flareMat, flare, starMat, star, ci: i });
    anchor(headGroup, 'spark', cx, 4.68, .12);
  });
  // labels: keep ignition and valvetrain apart on screen
  anchors.spark.position.set(CYL[3], 4.7, .12);

  anchor(headGroup, 'valve', CYL[0] - .85, 4.55, -.42);
  anchor(engine, 'piston', CYL[0], 3.34, .42);
  anchor(engine, 'crank', 1.15, 1.98, .72);

  /* ── crankshaft ───────────────────────────────────────────────────────── */
  const crankGroup = new THREE.Group();
  engine.add(crankGroup);
  cyl(.135, .135, 6.45, 20, M.crank, crankGroup, 0, CRANK_Y, 0, 'x');
  [-3.0, -1.5, 0, 1.5, 3.0].forEach(x => {
    cyl(.215, .215, .28, 20, M.crankDark, crankGroup, x, CRANK_Y, 0, 'x');
    bolt(crankGroup, x + .16, CRANK_Y, .245, .03, 0, M.brass);
  });
  // front nose
  cyl(.19, .19, .35, 18, M.steelDark, crankGroup, -3.32, CRANK_Y, 0, 'x');
  // rear flange
  cyl(.48, .48, .12, 32, M.crankDark, crankGroup, -3.48, CRANK_Y, 0, 'x');

  CYL.forEach((x, i) => {
    const throwG = new THREE.Group();
    throwG.position.set(x, CRANK_Y, 0);
    crankGroup.add(throwG);

    // webs
    [-.28, .28].forEach(dx => {
      rounded(.14, .88, .47, .12, M.crank, throwG, dx, .16, 0);
      // counterweight disc
      const cw = cyl(.42, .42, .145, 26, M.crankDark, throwG, dx, -.2, 0, 'x', false);
      // counterweight cutout detail
      const cwFace = cyl(.13, .13, .15, 16, M.steelDark, throwG, dx + .001, -.2, .2, 'x', false);
    });

    // crank pin
    cyl(.145, .145, .64, 18, M.steel, throwG, 0, CRANK_R, 0, 'x');
    bolt(throwG, .38, CRANK_R, 0, .026, 0, M.brass);
    // oil hole
    const oil = mesh(new THREE.SphereGeometry(.035, 8, 6), M.brass, throwG, 0, CRANK_R + .12, 0, false);

    moving.throws.push(throwG);
  });

  /* ── pistons ──────────────────────────────────────────────────────────── */
  CYL.forEach((x, i) => {
    const p = new THREE.Group();
    p.position.set(x, 3.6, 0);
    engine.add(p);

    cyl(.492, .486, .55, 28, M.piston, p, 0, 0, 0, 'y');
    // crown
    const crown = mesh(new THREE.CylinderGeometry(.492, .492, .035, 28), M.piston, p, 0, .292, 0);
    const dome = mesh(new THREE.SphereGeometry(.42, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.piston, p, 0, .29, 0, false);
    dome.scale.y = .16;
    // skirt reliefs
    [-1, 1].forEach(side => {
      box(.05, .34, .22, M.pistonSkirt, p, side * .48, -.12, 0, false);
    });
    // rings
    [.21, .155, .1].forEach((y, j) => {
      const ring = mesh(new THREE.TorusGeometry(.492, .017, 5, 30), M.ring, p, 0, y, 0, false);
      ring.rotation.x = Math.PI / 2;
    });
    // wrist pin
    cyl(.075, .075, .58, 12, M.steelDark, p, 0, 0, 0, 'x');
    // valve relief pockets
    [-1, 1].forEach(side => {
      const pocket = cyl(.07, .07, .012, 12, M.ring, p, side * .18, .31, 0, 'y', false);
    });
    moving.pistons.push({ group: p, index: i });
  });

  /* ── connecting rods ──────────────────────────────────────────────────── */
  CYL.forEach((x, i) => {
    const g = new THREE.Group();
    engine.add(g);

    const shaft = rounded(.14, 1, .2, .05, M.rod, g, 0, 0, 0);
    const smallEye = mesh(new THREE.TorusGeometry(.13, .045, 7, 20), M.rodDark, g, 0, 0, 0, false);
    smallEye.rotation.y = Math.PI / 2;
    const bigEye = mesh(new THREE.TorusGeometry(.185, .055, 8, 24), M.rodDark, g, 0, 0, 0, false);
    bigEye.rotation.y = Math.PI / 2;
    const smallBush = mesh(new THREE.TorusGeometry(.085, .022, 6, 18), M.brass, g, 0, 0, 0, false);
    smallBush.rotation.y = Math.PI / 2;
    const bigCap = rounded(.24, .17, .42, .05, M.rodDark, g, 0, 0, 0, false);
    const capBolt1 = bolt(g, .12, 0, .18, .03, 0, M.brass);
    const capBolt2 = bolt(g, -.12, 0, .18, .03, 0, M.brass);
    // small end pin
    cyl(.064, .064, .22, 10, M.steelDark, g, 0, 0, 0, 'x', false);

    moving.rods.push({ group: g, shaft, smallEye, bigEye, smallBush, bigCap, capBolt1, capBolt2, index: i });
  });

  /* ── combustion gas volumes ───────────────────────────────────────────── */
  const gasGeo = new THREE.CylinderGeometry(.49, .49, 1, 22, 1, true, Math.PI / 2, Math.PI);
  CYL.forEach((x, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x72b8e9, transparent: true, opacity: .08, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    const g = new THREE.Mesh(gasGeo, mat);
    g.position.set(x, 3.35, 0);
    g.castShadow = false;
    g.receiveShadow = false;
    engine.add(g);
    moving.gases.push(g);
  });

  /* ── timing drive ─────────────────────────────────────────────────────── */
  const timingGroup = new THREE.Group();
  engine.add(timingGroup);
  const TIMING_X = 3.34;
  // exposed timing case back-plate
  rounded(.07, 2.6, 2.22, .12, M.block, timingGroup, 3.26, 3.18, 0);
  for (let i = 0; i < 6; i++) {
    bolt(timingGroup, 3.3, 2.0 + i * .45, 1.02, .026, 0, M.steelDark);
    bolt(timingGroup, 3.3, 2.0 + i * .45, -1.02, .026, 0, M.steelDark);
  }

  function makeGear(radius, thickness, teeth, mat, parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    cyl(radius, radius, thickness, 36, mat, g, 0, 0, 0, 'x');
    const toothGeo = boxGeo(thickness * 1.03, .045, .07);
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * Math.PI * 2;
      const t = mesh(toothGeo, mat, g, 0, Math.cos(a) * (radius + .019), Math.sin(a) * (radius + .019), false);
      t.rotation.x = a;
    }
    // lightening holes
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const hole = cyl(.045, .045, thickness + .01, 10, M.steelDark, g, 0, Math.cos(a) * radius * .56, Math.sin(a) * radius * .56, 'x', false);
    }
    cyl(.09, .09, thickness + .035, 12, M.steel, g, 0, 0, 0, 'x', false);
    bolt(g, 0, 0, 0, .028, 0, M.brass);
    return g;
  }

  const crankGear = makeGear(.42, .16, 28, M.steel, timingGroup, TIMING_X, CRANK_Y, 0);
  const camGearL = makeGear(.5, .14, 34, M.steelDark, timingGroup, TIMING_X, 4.56, .52);
  const camGearR = makeGear(.5, .14, 34, M.crank, timingGroup, TIMING_X, 4.56, -.52);
  moving.timingGears.push(
    { group: crankGear, ratio: 1 },
    { group: camGearL, ratio: .5 },
    { group: camGearR, ratio: -.5 }
  );

  // chain path around the three sprockets
  const chainPts = [
    [TIMING_X, 1.51, 0], [TIMING_X, 1.62, .53], [TIMING_X, 2.15, .91],
    [TIMING_X, 3.25, 1.13], [TIMING_X, 4.25, 1.14], [TIMING_X, 5.04, .8],
    [TIMING_X, 5.11, .25], [TIMING_X, 5.11, -.25], [TIMING_X, 5.04, -.8],
    [TIMING_X, 4.25, -1.14], [TIMING_X, 3.25, -1.13], [TIMING_X, 2.15, -.91],
    [TIMING_X, 1.62, -.53]
  ];
  const chainCurve = new THREE.CatmullRomCurve3(
    chainPts.map(p => new THREE.Vector3(p[0], p[1], p[2])), true, 'catmullrom', .18
  );
  const linkGeo = boxGeo(.075, .115, .055);
  const chainGroup = new THREE.Group();
  chainGroup.position.x = .085;
  timingGroup.add(chainGroup);
  const linkCount = 58;
  const chainLinks = [];
  for (let i = 0; i < linkCount; i++) {
    const u = i / linkCount;
    const pos = chainCurve.getPointAt(u);
    const tan = chainCurve.getTangentAt(u).normalize();
    const link = new THREE.Mesh(linkGeo, i % 2 ? M2.chain : M.steelDark);
    link.position.copy(pos);
    link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    link.castShadow = true;
    link.receiveShadow = true;
    chainGroup.add(link);
    chainLinks.push(link);
  }
  moving.timingChain = { curve: chainCurve, links: chainLinks };
  // chain guides
  const guide = rounded(.06, 1.35, .12, .04, M2.plastic, timingGroup, TIMING_X + .09, 2.95, 1.04);
  guide.rotation.x = .08;
  const tensioner = cyl(.08, .08, .38, 14, M.steelDark, timingGroup, TIMING_X + .16, 2.65, .85, 'y', false);
  cyl(.13, .13, .08, 14, M.brass, tensioner.parent, TIMING_X + .16, 2.43, .85, 'y', false);
  anchor(engine, 'timing', TIMING_X + .1, 3.55, .2);

  /* ── intake manifold ──────────────────────────────────────────────────── */
  const intakeGroup = new THREE.Group();
  engine.add(intakeGroup);
  // raised intake plenum peeking over the cylinder head
  const intakeLog = cyl(.27, .27, 5.35, 28, M.castLight, intakeGroup, 0, 4.63, -1.64, 'x');
  const logEndL = mesh(new THREE.SphereGeometry(.27, 18, 12), M.castLight, intakeGroup, -2.68, 4.63, -1.64);
  const logEndR = mesh(new THREE.SphereGeometry(.27, 18, 12), M.castLight, intakeGroup, 2.68, 4.63, -1.64);
  for (let i = 0; i < 5; i++) {
    const ring = mesh(new THREE.TorusGeometry(.275, .022, 6, 20), M.steelDark, intakeGroup, -2.2 + i * 1.1, 4.63, -1.64, false);
    ring.rotation.y = Math.PI / 2;
  }

  CYL.forEach(x => {
    tube([
      [x, 3.98, -1.02], [x, 4.12, -1.18], [x, 4.4, -1.42], [x, 4.57, -1.6], [x, 4.63, -1.66]
    ], .12, M.castLight, intakeGroup, 22, 8);
    const collar = mesh(new THREE.TorusGeometry(.13, .026, 6, 18), M.steelDark, intakeGroup, x, 3.99, -1.07, false);
    collar.rotation.x = Math.PI / 2;
    // injector in the runner base
    cyl(.038, .038, .16, 8, M2.plastic, intakeGroup, x, 4.12, -1.2, 'y', false);
    cyl(.05, .05, .045, 8, M.orange, intakeGroup, x, 4.21, -1.2, 'y', false);
    // runner bolt flange
    bolt(intakeGroup, x - .12, 4.08, -1.15, .025, 0, M.brass);
    bolt(intakeGroup, x + .12, 4.08, -1.15, .025, 0, M.brass);
  });
  // intake badge plate
  const plenumTex = makeCanvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(45,60,50,.75)';
    ctx.font = '700 38px "Cascadia Mono", Consolas, monospace';
    ctx.letterSpacing = '5px';
    ctx.fillText('AIR  INTAKE', w / 2, 56);
    ctx.fillStyle = 'rgba(45,60,50,.45)';
    ctx.font = '500 18px "Microsoft YaHei", sans-serif';
    ctx.fillText('双涡管 · 电子节气门', w / 2, 88);
  });
  const plenumPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, .47),
    new THREE.MeshBasicMaterial({ map: plenumTex, transparent: true, depthWrite: false })
  );
  plenumPlate.position.set(-.2, 4.64, -1.355);
  intakeGroup.add(plenumPlate);

  // throttle body at the right end of the plenum
  const tb = new THREE.Group();
  tb.position.set(2.92, 4.63, -1.64);
  intakeGroup.add(tb);
  cyl(.2, .2, .26, 22, M.cast, tb, 0, 0, 0, 'x');
  cyl(.145, .145, .012, 22, M.steelDark, tb, .14, 0, 0, 'x', false);
  box(.14, .16, .12, M2.plastic, tb, .02, .2, .02);
  cyl(.045, .045, .09, 8, M.steel, tb, .02, .29, .02);
  // vacuum reference line
  tube([[2.62, 4.86, -1.5], [2.2, 4.95, -1.4], [1.4, 4.94, -1.3]], .016, M.rubber, intakeGroup, 16, 5, false);

  /* ── exhaust manifold ─────────────────────────────────────────────────── */
  const exhaustGroup = new THREE.Group();
  engine.add(exhaustGroup);
  const collector = mesh(new THREE.SphereGeometry(.235, 18, 12), M.bronze, exhaustGroup, 3.12, 2.82, 1.38);
  const runnerPaths = [
    [[-2.25, 3.94, 1.02], [-2.25, 3.55, 1.25], [-1.65, 3.17, 1.5], [.2, 2.93, 1.46], [2.35, 2.84, 1.4], [3.1, 2.82, 1.38]],
    [[-.75, 3.94, 1.02], [-.75, 3.52, 1.25], [-.25, 3.13, 1.48], [1.35, 2.9, 1.42], [3.1, 2.82, 1.38]],
    [[.75, 3.94, 1.02], [.75, 3.52, 1.25], [1.2, 3.13, 1.48], [2.2, 2.9, 1.42], [3.1, 2.82, 1.38]],
    [[2.25, 3.94, 1.02], [2.25, 3.52, 1.25], [2.6, 3.12, 1.48], [3.0, 2.92, 1.42], [3.1, 2.82, 1.38]]
  ];
  runnerPaths.forEach((pts, i) => {
    // the front of the cutaway is left open: cylinders 1–2 show sectioned ports
    if (i < 2) {
      const stub = cyl(.115, .115, .16, 16, M.bronze, exhaustGroup, CYL[i], 3.94, 1.06, 'z', false);
      const cutFace = cyl(.087, .087, .022, 16, M2.cutEdge, exhaustGroup, CYL[i], 3.94, 1.145, 'z', false);
      const cutInner = cyl(.063, .063, .006, 14, M2.port, exhaustGroup, CYL[i], 3.94, 1.157, 'z', false);
      const f = box(.34, .1, .05, M.bronze, exhaustGroup, CYL[i], 3.94, 1.02, false);
      bolt(exhaustGroup, CYL[i] - .12, 3.98, 1.06, .026, 0, M.brass);
      bolt(exhaustGroup, CYL[i] + .12, 3.98, 1.06, .026, 0, M.brass);
      return;
    }
    tube(pts, .095, M.bronze, exhaustGroup, 24, 8);
    const flange = box(.36, .1, .05, M.bronze, exhaustGroup, CYL[i], 3.94, 1.02, false);
    bolt(exhaustGroup, CYL[i] - .12, 3.98, 1.06, .026, 0, M.brass);
    bolt(exhaustGroup, CYL[i] + .12, 3.98, 1.06, .026, 0, M.brass);
  });
  // collector outlet into turbo
  tube([[3.1, 2.82, 1.38], [3.32, 2.72, 1.34], [3.42, 2.62, 1.24]], .11, M.bronze, exhaustGroup, 12, 8);
  // oxygen sensor
  const o2 = cyl(.055, .055, .17, 10, M.steel, exhaustGroup, 2.8, 3.02, 1.48, 'y', false);
  o2.rotation.z = .55;
  tube([[2.86, 3.1, 1.48], [3.2, 3.25, 1.38], [3.4, 3.42, 1.05]], .018, M.rubber, exhaustGroup, 14, 5, false);
  anchor(exhaustGroup, 'exhaust', 1.4, 3.55, 1.32);

  /* ── turbocharger ─────────────────────────────────────────────────────── */
  const turboGroup = new THREE.Group();
  turboGroup.position.set(3.55, 2.62, 1.16);
  engine.add(turboGroup);

  // bearing housing
  cyl(.13, .13, .5, 18, M.steelDark, turboGroup, 0, 0, 0, 'x');
  const oilIn = tube([[0, .28, -.12], [-.04, .45, -.25], [-.18, .52, -.2]], .022, M.brass, turboGroup, 12, 5, false);
  tube([[0, -.16, .02], [0, -.34, .12], [0, -.42, .32]], .025, M.brass, turboGroup, 12, 5, false);

  // turbine housing (bronze snail)
  const turbine = mesh(new THREE.TorusGeometry(.28, .13, 12, 28), M.bronze, turboGroup, -.28, 0, 0);
  turbine.rotation.y = Math.PI / 2;
  cyl(.37, .37, .24, 24, M.bronze, turboGroup, -.3, 0, 0, 'x');
  const turbineOutlet = cyl(.15, .17, .38, 18, M.bronze, turboGroup, -.34, -.36, .12, 'y');
  turbineOutlet.rotation.z = .2;
  // compressor housing (cool silver snail)
  const compressor = mesh(new THREE.TorusGeometry(.27, .12, 12, 28), M.castLight, turboGroup, .28, 0, 0);
  compressor.rotation.y = Math.PI / 2;
  cyl(.36, .36, .22, 24, M.castLight, turboGroup, .3, 0, 0, 'x');
  // compressor inlet trumpet
  cyl(.2, .28, .22, 20, M.steel, turboGroup, .56, 0, 0, 'x');
  cyl(.2, .2, .04, 20, M.steelDark, turboGroup, .68, 0, 0, 'x', false);
  // compressor wheel
  const wheel = new THREE.Group();
  wheel.position.set(.47, 0, 0);
  turboGroup.add(wheel);
  cyl(.07, .09, .18, 12, M.steelDark, wheel, 0, 0, 0, 'x');
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const blade = box(.09, .025, .27, M.steel, wheel, 0, Math.cos(a) * .14, Math.sin(a) * .14, false);
    blade.rotation.x = a;
    blade.rotation.z = .45;
  }
  moving.turboWheel = wheel;

  // wastegate
  const wg = new THREE.Group();
  wg.position.set(-.02, .4, .3);
  turboGroup.add(wg);
  cyl(.115, .115, .23, 14, M.steel, wg, 0, 0, 0, 'x');
  cyl(.09, .09, .03, 12, M.brass, wg, .12, 0, 0, 'x', false);
  const wgRod = cyl(.022, .022, .36, 8, M.steelDark, wg, -.15, -.06, .02, 'x', false);
  wgRod.rotation.z = .35;
  // wastegate bracket
  box(.1, .22, .1, M.steelDark, turboGroup, .0, .34, .22, false);
  anchor(turboGroup, 'turbo', 0, .62, .12);

  // turbo heat shield
  const turboShield = rounded(.72, .035, .58, .08, M2.heatShield, turboGroup, .0, .46, -.04, false);
  turboShield.rotation.z = -.08;

  // charge pipe: compressor -> throttle body
  const chargePipe = new THREE.Group();
  engine.add(chargePipe);
  tube([
    [3.8, 2.95, 1.3], [4.0, 3.45, 1.08], [4.16, 3.95, .46],
    [4.14, 4.34, -.22], [3.9, 4.58, -.85], [3.48, 4.68, -1.38], [3.13, 4.63, -1.64]
  ], .108, M.bluePipe, chargePipe, 48, 9);
  // silicone couplers
  [
    [3.8, 2.95, 1.3, .24],
    [3.13, 4.63, -1.64, .06]
  ].forEach(([x, y, z, ry], i) => {
    const c = cyl(.132, .132, .16, 14, M.bluePipe, chargePipe, x, y, z, i === 0 ? 'y' : 'x', false);
    c.rotation.y = ry;
  });
  [0.08, .3, .53, .76, .95].forEach(t => {
    const x = 3.8 + Math.sin(t * Math.PI) * .3 - t * .55;
    const y = 2.95 + t * 1.68;
    const z = 1.3 - t * 2.94;
    const clamp = mesh(new THREE.TorusGeometry(.111, .014, 5, 16), M.steel, chargePipe, x, y, z, false);
    clamp.rotation.y = Math.PI / 2;
  });

  // oil cooler line + misc details
  tube([[-2.8, 2.1, 1.08], [-2.4, 2.42, 1.12], [-1.1, 2.45, 1.11]], .018, M.rubber, engine, 14, 5, false);
  tube([[2.95, 3.93, 1.03], [3.24, 3.66, .9], [3.4, 3.4, .6]], .018, M.rubber, engine, 14, 5, false);

  // engine lifting eyes
  [-1.55, 1.55].forEach(x => {
    const eye = mesh(new THREE.TorusGeometry(.11, .026, 6, 16), M.orange, engine, x, 4.28, -1.11);
    eye.rotation.y = Math.PI / 2;
  });

  /* ── component metadata ───────────────────────────────────────────────── */
  anchor(engine, 'block', 0, 2.9, .82);
  anchor(engine, 'rod', CYL[0], 2.66, .46);

  const PART_DATA = [
    {
      id: 'piston', index: 1, name: '活塞', en: 'PISTON', tag: '运动件',
      desc: '承受燃烧气体的压力，通过连杆把直线往复运动交给曲轴，是能量转换的第一站。',
      specs: [['材料', '锻铝 · 阳极氧化'], ['工作温度', '200–350 °C'], ['活塞行程', '87 mm'], ['活塞质量', '约 280 g']],
      anchor: 'piston'
    },
    {
      id: 'rod', index: 2, name: '连杆', en: 'CONNECTING ROD', tag: '传动件',
      desc: '一头连接活塞销、一头抱住曲柄销，在摆动中把活塞的直线运动转换为曲轴的旋转运动。',
      specs: [['工艺', '锻钢 · 胀断剖分'], ['中心距', '138 mm'], ['大端轴瓦', '三层复合合金'], ['工作载荷', '交变拉压']],
      anchor: 'rod'
    },
    {
      id: 'crank', index: 3, name: '曲轴', en: 'CRANKSHAFT', tag: '核心旋转件',
      desc: '四缸的做功脉冲在这里汇合成连续旋转，并通过飞轮储存动能、吸收扭转振动。',
      specs: [['材料', '锻钢 · 氮化处理'], ['曲柄半径', '45 mm'], ['点火顺序', '1–3–4–2'], ['主轴颈', '5 道']],
      anchor: 'crank'
    },
    {
      id: 'valve', index: 4, name: '气门组', en: 'VALVETRAIN', tag: '配气机构',
      desc: '双顶置凸轮轴驱动 16 个气门，按正时精确开闭，控制新鲜空气进入与燃烧废气排出。',
      specs: [['布置', 'DOHC · 16 气门'], ['排气门温度', '700–800 °C'], ['气门升程', '10.5 mm'], ['传动比', '曲轴 2 : 凸轮 1']],
      anchor: 'valve'
    },
    {
      id: 'spark', index: 5, name: '火花塞', en: 'SPARK PLUG', tag: '点火系统',
      desc: '在压缩行程末端产生高压电火花，点燃被压缩的混合气，让化学能瞬间释放为热能。',
      specs: [['电极', '铱金 · 细电极'], ['点火电压', '25–35 kV'], ['点火提前角', '动态调节'], ['更换周期', '约 40,000 km']],
      anchor: 'spark'
    },
    {
      id: 'turbo', index: 6, name: '涡轮增压器', en: 'TURBOCHARGER', tag: '进气增压',
      desc: '废气流推动涡轮，涡轮同轴带动压气机，把更多空气压入气缸，让小排量发动机输出更大扭矩。',
      specs: [['最高转速', '180,000 r/min'], ['增压压力', '1.2 bar'], ['涡轮材料', '耐热镍基合金'], ['冷却方式', '机油 + 冷却液']],
      anchor: 'turbo'
    },
    {
      id: 'block', index: 7, name: '缸体', en: 'CYLINDER BLOCK', tag: '承载结构',
      desc: '发动机的骨架，集成气缸、曲轴箱与冷却液通道，为所有运动件提供精确的安装位置。',
      specs: [['材料', '铝合金 · 压铸'], ['缸径 × 行程', '74 × 87 mm'], ['排量', '1.5 L'], ['缸体形式', '直列四缸']],
      anchor: 'block'
    },
    {
      id: 'timing', index: 8, name: '正时机构', en: 'TIMING DRIVE', tag: '同步系统',
      desc: '链条把曲轴的动力按 2:1 传给两根凸轮轴，保证气门开闭与活塞位置始终精确同步。',
      specs: [['形式', '静音链条'], ['传动比', '2 : 1'], ['张紧方式', '液压张紧器'], ['维护', '免维护设计']],
      anchor: 'timing'
    }
  ];
  const PART_BY_ID = Object.fromEntries(PART_DATA.map(p => [p.id, p]));

  // attache clickable identity to major assemblies
  blockGroup.userData.part = 'block';
  panGroup.userData.part = 'block';
  headGroup.userData.part = 'valve';
  coverGroup.userData.part = 'valve';
  intakeGroup.userData.part = 'valve';
  exhaustGroup.userData.part = 'turbo';
  turboGroup.userData.part = 'turbo';
  timingGroup.userData.part = 'timing';
  crankGroup.userData.part = 'crank';
  moving.pistons.forEach(p => { p.group.userData.part = 'piston'; });
  moving.rods.forEach(r => { r.group.userData.part = 'rod'; });
  moving.plugs.forEach(pl => { pl.root.userData.part = 'spark'; });

  /* ── floating labels ──────────────────────────────────────────────────── */
  const labelsEl = $('#labels');
  const LABELS = [
    { id: 'spark', text: '火花塞', side: 'right' },
    { id: 'valve', text: '进气门', side: 'left' },
    { id: 'piston', text: '活塞', side: 'left' },
    { id: 'crank', text: '曲轴', side: 'right' },
    { id: 'turbo', text: '涡轮增压器', side: 'right' }
  ];
  const labelNodes = LABELS.map(cfg => {
    const b = document.createElement('button');
    b.className = 'hotspot';
    b.dataset.part = cfg.id;
    b.innerHTML = `<span class="hs-dot"></span><span class="hs-pill"><i></i>${cfg.text}</span>`;
    if (cfg.side === 'left') b.classList.add('flip');
    b.setAttribute('aria-label', `查看${cfg.text}`);
    labelsEl.appendChild(b);
    return { el: b, cfg };
  });
  labelsEl.addEventListener('click', e => {
    const node = e.target.closest('.hotspot');
    if (!node) return;
    selectPart(node.dataset.part, { focus: true, manual: true });
  });

  // selection halo
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x2b6fe5, transparent: true, opacity: .62, depthTest: false,
    depthWrite: false, side: THREE.DoubleSide
  });
  const halo = new THREE.Mesh(new THREE.RingGeometry(.085, .13, 32), haloMat);
  halo.renderOrder = 20;
  halo.visible = false;
  scene.add(halo);
  const haloInner = new THREE.Mesh(
    new THREE.CircleGeometry(.035, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, depthTest: false, depthWrite: false })
  );
  haloInner.renderOrder = 21;
  haloInner.visible = false;
  scene.add(haloInner);

  /* ── camera + interaction ─────────────────────────────────────────────── */
  const cam = {
    theta: .80, phi: 1.12, radius: 16.2,
    target: new THREE.Vector3(1.6, 2.6, 0),
    dTheta: .80, dPhi: 1.12, dRadius: 16.2,
    dTarget: new THREE.Vector3(1.6, 2.6, 0)
  };
  let autoRotate = true;
  let lastInteraction = performance.now();
  let dragging = false;
  let downX = 0, downY = 0, moved = 0, pointerDownAt = 0;
  let activePointer = null;
  const pointers = new Map();
  let lastPinch = 0;

  function baseView() {
    const w = window.innerWidth;
    if (w <= 840) {
      return {
        theta: .72, phi: 1.05, radius: 21.8,
        target: new THREE.Vector3(.25, 1.95, 0)
      };
    }
    if (w <= 1100) {
      return {
        theta: .78, phi: 1.12, radius: 18.2,
        target: new THREE.Vector3(2.2, 2.7, 0)
      };
    }
    if (w <= 1280) {
      return {
        theta: .80, phi: 1.12, radius: 17.0,
        target: new THREE.Vector3(1.9, 2.62, 0)
      };
    }
    return {
      theta: .80, phi: 1.12, radius: 16.2,
      target: new THREE.Vector3(1.6, 2.6, 0)
    };
  }

  function resetCamera(instant = false) {
    const v = baseView();
    cam.dTheta = v.theta; cam.dPhi = v.phi; cam.dRadius = v.radius; cam.dTarget.copy(v.target);
    if (instant) {
      cam.theta = v.theta; cam.phi = v.phi; cam.radius = v.radius; cam.target.copy(v.target);
    }
    lastInteraction = performance.now();
  }
  resetCamera(true);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  canvas.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    lastInteraction = performance.now();
    if (pointers.size === 1) {
      activePointer = e.pointerId;
      dragging = true;
      downX = e.clientX; downY = e.clientY;
      moved = 0;
      pointerDownAt = performance.now();
      canvas.style.cursor = 'grabbing';
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
      activePointer = null;
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastInteraction = performance.now();
    if (pointers.size === 1 && activePointer === e.pointerId) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      cam.dTheta -= dx * .0044;
      cam.dPhi = clamp(cam.dPhi - dy * .0031, .58, 1.34);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch > 0) cam.dRadius = clamp(cam.dRadius - (dist - lastPinch) * .055, 9, 24);
      lastPinch = dist;
    }
  });

  function endPointer(e) {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (activePointer === e.pointerId) {
      activePointer = null;
      const dt = performance.now() - pointerDownAt;
      if (moved < 7 && dt < 500 && p) {
        const part = pickAt(e.clientX, e.clientY);
        if (part) selectPart(part, { focus: true, manual: true });
      }
    }
    if (pointers.size < 2) lastPinch = 0;
    if (pointers.size === 0) {
      dragging = false;
      canvas.style.cursor = 'grab';
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    lastInteraction = performance.now();
    cam.dRadius = clamp(cam.dRadius + e.deltaY * .022, 10.2, 24);
  }, { passive: false });

  canvas.addEventListener('dblclick', () => resetCamera());
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickAt(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (const hit of hits) {
      let visible = true;
      let o = hit.object;
      while (o) {
        if (!o.visible) { visible = false; break; }
        o = o.parent;
      }
      if (!visible) continue;
      o = hit.object;
      while (o && !o.userData.part) o = o.parent;
      if (o && o.userData.part) return o.userData.part;
    }
    return null;
  }

  /* ── UI state ─────────────────────────────────────────────────────────── */
  const state = {
    running: true,
    rpm: 2400,
    crank: 0,
    cutaway: true,
    exploded: false,
    labels: true,
    tour: false,
    selected: 'piston',
    tab: 'live',
    sciTab: 'physics'
  };

  const RPM_MIN = 800;
  const RPM_MAX = 8000;
  const RPM_REDLINE = 6500;

  const CYCLE_PHASES = [
    { name: '进气', en: 'INTAKE', color: '#2b6fe5' },
    { name: '压缩', en: 'COMPRESS', color: '#c4913f' },
    { name: '做功', en: 'POWER', color: '#d36b41' },
    { name: '排气', en: 'EXHAUST', color: '#748573' }
  ];
  const CYCLE_OFFSETS = [0, 180, 540, 360];
  const GAS_COLORS = [
    new THREE.Color(0x62afe3),
    new THREE.Color(0xe3ba63),
    new THREE.Color(0xef7c3e),
    new THREE.Color(0x8c998a)
  ];
  const GAS_HOT = new THREE.Color(0xffe7a8);

  const el = {
    mRpm: $('#mRpm'), mTorque: $('#mTorque'), mPower: $('#mPower'),
    rpmRange: $('#rpmRange'), rpmLabel: $('#rpmLabel'),
    crankAngle: $('#crankAngle'), cyclePhase: $('#cyclePhase'),
    cycleFill: $('#cycleFill'), cycleSteps: $('#cycleSteps'),
    cycleCard: $('.cycle-card'),
    partCount: $('#partCount'), partIndex: $('#partIndex'), partName: $('#partName'),
    partEn: $('#partEn'), partTag: $('#partTag'), partDesc: $('#partDesc'),
    partSpecs: $('#partSpecs'), partList: $('#partList'), partCard: $('#partCard'),
    runBtn: $('#runBtn'), tourBtn: $('#tourBtn'),
    tabLiveBtn: $('#tabLiveBtn'), tabInfoBtn: $('#tabInfoBtn'), tabScienceBtn: $('#tabScienceBtn'),
    tabLive: $('#tabLive'), tabInfo: $('#tabInfo'), tabScience: $('#tabScience'),
    sciPhysics: $('#sciPhysics'), sciChem: $('#sciChem'), pvPhase: $('#pvPhase'),
    panelScroll: $('#panelScroll'),
    panelToggle: $('#panelToggle'), panelReopen: $('#panelReopen'), panel: $('#panel'),
    resetBtn: $('#resetBtn'), cutBtn: $('#cutBtn'), explodeBtn: $('#explodeBtn'),
    rotateBtn: $('#rotateBtn'), labelsBtn: $('#labelsBtn'),
    chart: $('#chart')
  };

  let explodeAmount = 0;
  let cutAmount = 1;
  let tourTimer = null;
  let tourIndex = 0;
  let lastCycleInt = -1;
  let panelFolded = false;
  let pvReady = false;
  let pvPaths = [];
  let pvLengths = [];
  let pvDot = null;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function torqueAt(rpm) {
    const pts = [
      [800, 150], [1200, 200], [1800, 250], [4000, 250],
      [4800, 218], [5200, 201], [5500, 191], [6500, 160],
      [7000, 145], [7500, 128], [8000, 110]
    ];
    if (rpm <= pts[0][0]) return pts[0][1];
    if (rpm >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++) {
      if (rpm <= pts[i][0]) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        let t = (rpm - x0) / (x1 - x0);
        t = t * t * (3 - 2 * t);
        return y0 + (y1 - y0) * t;
      }
    }
    return 250;
  }

  function updateMetrics() {
    const rpm = state.rpm;
    const tq = Math.round(torqueAt(rpm));
    const kw = Math.round(tq * rpm / 9550);
    const overRedline = rpm >= RPM_REDLINE;
    el.mRpm.textContent = rpm.toLocaleString('en-US');
    el.mTorque.textContent = tq;
    el.mPower.textContent = kw;
    el.rpmLabel.textContent = rpm.toLocaleString('en-US');
    el.rpmRange.value = rpm;
    el.mRpm.classList.toggle('redline', overRedline);
    const rpmValue = el.rpmLabel.closest('b');
    if (rpmValue) rpmValue.classList.toggle('redline', overRedline);
    el.rpmRange.classList.toggle('over-redline', overRedline);
    el.rpmRange.style.setProperty('--rpm-color', overRedline ? 'var(--red)' : 'var(--blue)');
    const fill = (rpm - RPM_MIN) / (RPM_MAX - RPM_MIN) * 100;
    el.rpmRange.style.setProperty('--fill', fill.toFixed(1) + '%');
    renderChart(rpm, tq, kw);
  }

  function renderChart(rpm, tq, kw) {
    const W = 330, H = 96, L = 28, R = 6, T = 8, B = 19;
    const x = r => L + (r - RPM_MIN) / (RPM_MAX - RPM_MIN) * (W - L - R);
    const yT = v => T + (1 - v / 300) * (H - T - B);
    const yP = v => T + (1 - v / 135) * (H - T - B);
    const ticks = [0, .25, .5, .75, 1];
    let grid = '';
    ticks.forEach(t => {
      const yy = T + t * (H - T - B);
      grid += `<line class="chart-grid" x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}"/>`;
    });
    const redX = x(RPM_REDLINE);
    grid += `<rect x="${redX.toFixed(1)}" y="${T}" width="${(W - R - redX).toFixed(1)}" height="${H - T - B}" fill="rgba(211,107,65,.055)"/>`;
    grid += `<line x1="${redX.toFixed(1)}" y1="${T}" x2="${redX.toFixed(1)}" y2="${H - B}" stroke="rgba(211,107,65,.42)" stroke-width=".8" stroke-dasharray="2 2"/>`;
    grid += `<text class="chart-axis" x="2" y="${(T + 3).toFixed(1)}">300</text>`;
    grid += `<text class="chart-axis" x="2" y="${(T + (H - T - B) / 2 + 3).toFixed(1)}">150</text>`;
    grid += `<text class="chart-axis" x="8" y="${(H - B + 1).toFixed(1)}">0</text>`;
    [RPM_MIN, 4000, RPM_MAX].forEach((r, i) => {
      const tx = x(r);
      const anchor = i === 0 ? 'start' : i === 2 ? 'end' : 'middle';
      grid += `<text class="chart-axis" text-anchor="${anchor}" x="${tx.toFixed(1)}" y="${H - 4}">${r}</text>`;
    });

    let tqPath = '', pwPath = '';
    for (let r = RPM_MIN; r <= RPM_MAX; r += 100) {
      const t = torqueAt(r);
      const p = t * r / 9550;
      tqPath += `${tqPath ? 'L' : 'M'}${x(r).toFixed(1)} ${yT(t).toFixed(1)} `;
      pwPath += `${pwPath ? 'L' : 'M'}${x(r).toFixed(1)} ${yP(p).toFixed(1)} `;
    }

    const mx = x(rpm);
    const myT = yT(tq);
    const myP = yP(kw);

    el.chart.innerHTML = `
      ${grid}
      <path class="chart-tq" d="${tqPath}"/>
      <path class="chart-pw" d="${pwPath}"/>
      <line class="chart-marker" x1="${mx.toFixed(1)}" y1="${T}" x2="${mx.toFixed(1)}" y2="${H - B}"/>
      <circle class="chart-dot-tq" cx="${mx.toFixed(1)}" cy="${myT.toFixed(1)}" r="2.7"/>
      <circle class="chart-dot-pw" cx="${mx.toFixed(1)}" cy="${myP.toFixed(1)}" r="2.7"/>
      <text class="chart-current" text-anchor="${mx > W - 78 ? 'end' : 'start'}" x="${(mx + (mx > W - 78 ? -4 : 4)).toFixed(1)}" y="${Math.max(12, myT - 6).toFixed(1)}">${tq} N·m</text>
    `;
  }

  function updateTool(btn, on) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    const b = btn.querySelector('b');
    if (b) b.textContent = on ? '开' : '关';
  }

  function isMobilePanel() {
    return innerWidth <= 840;
  }

  function syncPanelChrome() {
    const desktop = !isMobilePanel();
    el.panelToggle.setAttribute('aria-expanded', String(!panelFolded));
    el.panelToggle.setAttribute('aria-label', panelFolded ? '展开知识面板' : '收起知识面板');
    el.panelToggle.title = panelFolded ? '展开知识面板' : '收起知识面板';
    document.body.classList.toggle('panel-collapsed', panelFolded && desktop);

    if (desktop) {
      el.panelReopen.classList.toggle('show', panelFolded);
      el.panelReopen.setAttribute('aria-hidden', String(!panelFolded));
      el.panelReopen.tabIndex = panelFolded ? 0 : -1;
      if (panelFolded) {
        el.panel.setAttribute('inert', '');
        el.panel.setAttribute('aria-hidden', 'true');
      } else {
        el.panel.removeAttribute('inert');
        el.panel.removeAttribute('aria-hidden');
      }
    } else {
      el.panelReopen.classList.remove('show');
      el.panelReopen.setAttribute('aria-hidden', 'true');
      el.panelReopen.tabIndex = -1;
      el.panel.removeAttribute('inert');
      el.panel.removeAttribute('aria-hidden');
    }
  }

  function setPanelFolded(folded, opts = {}) {
    if (panelFolded === folded) return;
    panelFolded = folded;
    el.panel.classList.toggle('collapsed', folded);
    syncPanelChrome();
    if (opts.focus === false) return;
    if (folded && !isMobilePanel()) {
      requestAnimationFrame(() => el.panelReopen.focus({ preventScroll: true }));
    } else if (!folded) {
      requestAnimationFrame(() => el.panelToggle.focus({ preventScroll: true }));
    }
  }

  function updateRotateTool() {
    updateTool(el.rotateBtn, autoRotate);
  }

  function setRunning(run) {
    state.running = run;
    el.runBtn.classList.toggle('is-running', run);
    el.runBtn.querySelector('span').textContent = run ? '暂停运行' : '开始运行';
    el.runBtn.setAttribute('aria-pressed', String(run));
  }

  function setCutaway(on) {
    state.cutaway = on;
    updateTool(el.cutBtn, on);
  }

  function setExploded(on) {
    state.exploded = on;
    updateTool(el.explodeBtn, on);
  }

  function setTab(tab) {
    state.tab = tab;
    const tabs = [
      { id: 'live', btn: el.tabLiveBtn, page: el.tabLive },
      { id: 'info', btn: el.tabInfoBtn, page: el.tabInfo },
      { id: 'science', btn: el.tabScienceBtn, page: el.tabScience }
    ];
    tabs.forEach(({ id, btn, page }) => {
      const on = id === tab;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', String(on));
      page.hidden = !on;
    });
    el.panelScroll.scrollTop = 0;
    if (tab === 'science' && state.sciTab === 'physics') {
      requestAnimationFrame(() => { initPV(); updatePV(); });
    }
  }

  function initPV() {
    if (pvReady) return;
    pvDot = document.getElementById('pvDot');
    pvPaths = ['pvIntake', 'pvCompression', 'pvPower', 'pvExhaust']
      .map(id => document.getElementById(id));
    if (pvPaths.some(path => !path) || !pvDot) return;
    pvLengths = pvPaths.map(path => path.getTotalLength());
    pvReady = pvLengths.every(length => length > 0);
  }

  function updatePV() {
    if (!pvReady) initPV();
    if (!pvReady || state.tab !== 'science' || state.sciTab !== 'physics') return;
    const ca = state.crank % 720;
    const idx = Math.floor(ca / 180) % 4;
    const t = (ca % 180) / 180;
    const path = pvPaths[idx];
    const point = path.getPointAtLength(pvLengths[idx] * t);
    pvDot.setAttribute('cx', point.x.toFixed(1));
    pvDot.setAttribute('cy', point.y.toFixed(1));
    pvDot.setAttribute('stroke', CYCLE_PHASES[idx].color);
    pvPaths.forEach((p, i) => p.classList.toggle('on', i === idx));
    el.pvPhase.textContent = CYCLE_PHASES[idx].name;
    el.pvPhase.style.setProperty('--phase-color', CYCLE_PHASES[idx].color);
  }

  function setSciTab(tab) {
    state.sciTab = tab;
    document.querySelectorAll('.sci-tab').forEach(btn => {
      const on = btn.dataset.sci === tab;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', String(on));
    });
    el.sciPhysics.hidden = tab !== 'physics';
    el.sciChem.hidden = tab !== 'chem';
    if (tab === 'physics') {
      requestAnimationFrame(() => { initPV(); updatePV(); });
    }
  }

  function renderPartList() {
    el.partList.innerHTML = PART_DATA.map(p => `
      <button class="part-row" data-part="${p.id}">
        <span>${pad2(p.index)}</span>
        <span class="pr-name">${p.name}</span>
        <span class="pr-en">${p.en}</span>
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    `).join('');
  }

  function updatePartUI(part) {
    el.partCount.textContent = `${part.index} / ${PART_DATA.length}`;
    el.partIndex.textContent = pad2(part.index);
    el.partName.textContent = part.name;
    el.partEn.textContent = part.en;
    el.partTag.textContent = part.tag;
    el.partDesc.textContent = part.desc;
    el.partSpecs.innerHTML = part.specs.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    labelNodes.forEach(n => n.el.classList.toggle('active', n.cfg.id === part.id));
    [...el.partList.querySelectorAll('.part-row')].forEach(row => {
      row.classList.toggle('on', row.dataset.part === part.id);
    });
    el.partCard.animate(
      [{ transform: 'translateY(3px)', opacity: .72 }, { transform: 'none', opacity: 1 }],
      { duration: 260, easing: 'ease-out' }
    );
  }

  function selectPart(id, opts = {}) {
    const part = PART_BY_ID[id];
    if (!part) return;
    if (opts.manual && state.tour) stopTour();
    state.selected = id;
    updatePartUI(part);
    if (state.tab !== 'live') setTab('live');
    if (opts.focus) focusOn(id);
  }

  function focusOn(id) {
    const part = PART_BY_ID[id];
    if (!part) return;
    const a = anchors[part.anchor];
    if (!a) return;
    a.getWorldPosition(tmpV);
    cam.dTarget.copy(tmpV);
    cam.dTarget.y += .12;
    if (innerWidth > 840) cam.dTarget.x += .85;
    cam.dRadius = id === 'block' ? 14.2 : id === 'crank' ? 12.2 : id === 'turbo' ? 11.6 : 11.4;
    autoRotate = false;
    updateRotateTool();
    lastInteraction = performance.now();
  }

  function nextPart() {
    const i = PART_DATA.findIndex(p => p.id === state.selected);
    const part = PART_DATA[(i + 1) % PART_DATA.length];
    selectPart(part.id, { focus: true, manual: true });
  }

  function stopTour() {
    state.tour = false;
    clearTimeout(tourTimer);
    tourTimer = null;
    el.tourBtn.classList.remove('on');
    el.tourBtn.querySelector('span').textContent = '自动讲解';
    autoRotate = true;
    updateRotateTool();
  }

  function startTour() {
    if (state.tour) return;
    state.tour = true;
    el.tourBtn.classList.add('on');
    el.tourBtn.querySelector('span').textContent = '停止讲解';
    autoRotate = false;
    updateRotateTool();
    tourIndex = 0;
    tourStep();
  }

  function tourStep() {
    if (!state.tour) return;
    const part = PART_DATA[tourIndex % PART_DATA.length];
    selectPart(part.id, { focus: true, manual: false });
    tourTimer = setTimeout(() => {
      tourIndex++;
      tourStep();
    }, 5400);
  }

  /* ── UI events ────────────────────────────────────────────────────────── */
  el.rpmRange.addEventListener('input', () => {
    state.rpm = Number(el.rpmRange.value);
    updateMetrics();
  });

  el.cycleSteps.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const idx = Number(btn.dataset.stroke);
    setRunning(false);
    state.crank = idx * 180;
    lastCycleInt = -1;
    updateCycleUI(true);
  });

  el.partList.addEventListener('click', e => {
    const row = e.target.closest('.part-row');
    if (!row) return;
    selectPart(row.dataset.part, { focus: true, manual: true });
  });

  el.runBtn.addEventListener('click', () => setRunning(!state.running));
  el.tourBtn.addEventListener('click', () => {
    if (state.tour) stopTour(); else startTour();
  });
  $('#focusBtn').addEventListener('click', () => focusOn(state.selected));
  $('#nextPartBtn').addEventListener('click', nextPart);
  el.tabLiveBtn.addEventListener('click', () => setTab('live'));
  el.tabInfoBtn.addEventListener('click', () => setTab('info'));
  el.tabScienceBtn.addEventListener('click', () => setTab('science'));
  document.querySelectorAll('.sci-tab').forEach(btn => {
    btn.addEventListener('click', () => setSciTab(btn.dataset.sci));
  });

  el.resetBtn.addEventListener('click', () => {
    resetCamera();
    autoRotate = true;
    updateRotateTool();
  });
  el.cutBtn.addEventListener('click', () => setCutaway(!state.cutaway));
  el.explodeBtn.addEventListener('click', () => setExploded(!state.exploded));
  el.rotateBtn.addEventListener('click', () => {
    autoRotate = !autoRotate;
    lastInteraction = performance.now();
    updateRotateTool();
  });
  el.labelsBtn.addEventListener('click', () => {
    state.labels = !state.labels;
    labelsEl.classList.toggle('is-hidden', !state.labels);
    updateTool(el.labelsBtn, state.labels);
    halo.visible = false;
    haloInner.visible = false;
  });
  el.panelToggle.addEventListener('click', () => {
    setPanelFolded(!panelFolded);
  });
  el.panelReopen.addEventListener('click', () => {
    setPanelFolded(false);
  });

  window.addEventListener('keydown', e => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key >= '1' && e.key <= '4') {
      const idx = Number(e.key) - 1;
      setRunning(false);
      state.crank = idx * 180;
      lastCycleInt = -1;
      updateCycleUI(true);
    } else if (e.code === 'Space') {
      e.preventDefault();
      setRunning(!state.running);
    } else if (e.key === 'r' || e.key === 'R') {
      resetCamera();
      autoRotate = true;
      updateRotateTool();
    } else if (e.key === 'e' || e.key === 'E') {
      setExploded(!state.exploded);
    } else if (e.key === 'l' || e.key === 'L') {
      state.labels = !state.labels;
      labelsEl.classList.toggle('is-hidden', !state.labels);
      updateTool(el.labelsBtn, state.labels);
    } else if (e.key === 'p' || e.key === 'P') {
      setPanelFolded(!panelFolded);
    } else if (e.key === 'Escape') {
      if (state.tour) stopTour();
      if (panelFolded) setPanelFolded(false, { focus: false });
    }
  });

  /* ── mechanism / labels / frame loop ──────────────────────────────────── */
  function updateCycleUI(force = false) {
    const ca = state.crank % 720;
    const phaseIdx = Math.floor(ca / 180) % 4;
    const phase = CYCLE_PHASES[phaseIdx];
    const caInt = Math.floor(ca);
    if (!force && caInt === lastCycleInt) return;
    lastCycleInt = caInt;
    el.crankAngle.textContent = caInt;
    el.cycleFill.style.width = (ca / 720 * 100).toFixed(2) + '%';
    el.cyclePhase.textContent = phase.name;
    el.cycleCard.style.setProperty('--phase-color', phase.color);
    el.cyclePhase.style.setProperty('--phase-color', phase.color);
    [...el.cycleSteps.children].forEach((btn, i) => {
      btn.classList.toggle('on', i === phaseIdx);
      btn.classList.toggle('done', i < phaseIdx);
    });
  }

  function combustionAt(ca) {
    // ignition starts just before TDC and the fireball fades through the power stroke
    if (ca < 352 || ca > 512) return 0;
    const p = (ca - 352) / 160;
    if (p < .06) return p / .06;
    return Math.pow(1 - (p - .06) / .94, 1.55);
  }

  function valveLift(ca, type) {
    let a, start;
    if (type === 'intake') {
      if (ca <= 220) a = ca;
      else if (ca >= 704) a = ca - 720;
      else return 0;
      start = -16;
      return Math.pow(Math.sin(Math.PI * clamp((a - start) / 236, 0, 1)), 1.35);
    }
    if (ca >= 500) a = ca;
    else if (ca <= 16) a = ca + 720;
    else return 0;
    start = 500;
    return Math.pow(Math.sin(Math.PI * clamp((a - start) / 236, 0, 1)), 1.35);
  }

  const UP = new THREE.Vector3(0, 1, 0);
  const rodDir = new THREE.Vector3();
  const pinPos = new THREE.Vector3();
  const crankPin = new THREE.Vector3();
  const rodMid = new THREE.Vector3();

  function updateMechanism(dt, t) {
    const crankRad = state.crank * Math.PI / 180;
    const pins = [];

    for (let i = 0; i < 4; i++) {
      const a = (state.crank + CYCLE_OFFSETS[i]) * Math.PI / 180;
      const sinA = Math.sin(a);
      const pinY = CRANK_Y + CRANK_R * Math.cos(a) + Math.sqrt(ROD_L * ROD_L - CRANK_R * CRANK_R * sinA * sinA);
      pins.push(pinY);

      const p = moving.pistons[i].group;
      p.position.y = pinY;

      const th = moving.throws[i];
      th.rotation.x = a;

      // rod
      const rd = moving.rods[i];
      pinPos.set(CYL[i], pinY, 0);
      crankPin.set(CYL[i], CRANK_Y + CRANK_R * Math.cos(a), CRANK_R * sinA);
      rodMid.copy(pinPos).add(crankPin).multiplyScalar(.5);
      rd.group.position.copy(rodMid);
      rodDir.copy(pinPos).sub(crankPin);
      const len = rodDir.length();
      rodDir.normalize();
      rd.group.quaternion.setFromUnitVectors(UP, rodDir);
      rd.shaft.scale.y = Math.max(.2, len - .26);
      rd.smallEye.position.set(0, len / 2, 0);
      rd.smallBush.position.set(0, len / 2, 0);
      rd.bigEye.position.set(0, -len / 2, 0);
      rd.bigCap.position.set(0, -len / 2, 0);
      rd.capBolt1.position.set(.12, -len / 2, .18);
      rd.capBolt2.position.set(-.12, -len / 2, .18);

      // gas volume / stroke state
      const ca = (state.crank + CYCLE_OFFSETS[i]) % 720;
      const stroke = Math.floor(ca / 180) % 4;
      const blast = combustionAt(ca);
      const gas = moving.gases[i];
      const top = DECK_Y - .015;
      const bottom = pinY + .285;
      const h = Math.max(.06, top - bottom);
      gas.position.y = (top + bottom) / 2;
      gas.scale.y = h;
      gas.material.color.copy(GAS_COLORS[stroke]);
      if (stroke === 2) gas.material.color.lerp(GAS_HOT, blast * .72);
      const baseOpacity = [.075, .105, .20, .05][stroke];
      gas.material.opacity = baseOpacity * (i === 0 ? 1.35 : 1) + (stroke === 2 ? blast * .34 : 0);

      // valves
      moving.valves.forEach(v => {
        if (v.ci !== i) return;
        const lift = valveLift(ca, v.side < 0 ? 'intake' : 'exhaust');
        v.group.position.y = -lift * .145;
        v.spring.scale.y = 1 - lift * .25;
        v.spring.position.y = -lift * .03;
      });

      // ignition + combustion fireball
      const spark = Math.exp(-Math.pow((ca - 357) / 7.5, 2));
      const plug = moving.plugs[i];
      if (plug) {
        plug.tipMat.emissiveIntensity = spark * 8.5 + blast * 1.4;
        plug.flash.opacity = spark * .96;
        if (plug.flashSprite) {
          const fs = .8 + spark * 1.5;
          plug.flashSprite.scale.set(fs, fs, 1);
        }
        plug.light.color.setHex(0xff7c36);
        plug.light.distance = 3.4;
        plug.light.intensity = spark * 8.5 + blast * 3.6;
        plug.light.position.set(CYL[i], Math.max(3.45, top - .04), .35);
      }

      const flame = moving.flames[i];
      if (flame) {
        const flicker = .9 + Math.sin(t * 34 + i * 1.8) * .1;
        const chamberY = Math.max(3.42, (top + bottom) / 2);
        const fs = .62 + blast * .72;
        flame.sprite.position.set(CYL[i], chamberY, .64);
        flame.sprite.scale.set(fs, fs * .94, 1);
        flame.mat.opacity = blast * .46 * flicker;
        flame.mat.color.setRGB(1, .58 + blast * .26, .2 + blast * .28);
        flame.mat.rotation = ca * .018;

        const cutVisible = state.cutaway ? 1 : 0;
        const glowSize = 1.0 + blast * .7;
        flame.glow.position.set(CYL[i], 3.18, 1.135);
        flame.glow.scale.set(glowSize, glowSize, 1);
        flame.glowMat.opacity = blast * .62 * cutVisible * flicker;

        const rp = clamp((ca - 352) / 150, 0, 1);
        const ringSize = .55 + rp * 1.85;
        flame.ring.position.set(CYL[i], 3.18, 1.16);
        flame.ring.scale.set(ringSize, ringSize, 1);
        flame.ringMat.opacity = Math.pow(1 - rp, 1.15) * .65 * cutVisible;

        // outer burst spills past the bore rim, making the ignition read as an explosion
        const flareSize = 1.15 + blast * 1.55;
        flame.flare.position.set(CYL[i], 3.18, 1.41);
        flame.flare.scale.set(flareSize, flareSize * .92, 1);
        flame.flareMat.opacity = blast * .42 * cutVisible * flicker;
        flame.flareMat.rotation = -ca * .022;

        const ignite = Math.exp(-Math.pow((ca - 357) / 14, 2));
        const starSize = 1.25 + ignite * 1.35;
        flame.star.position.set(CYL[i], 3.18, 1.45);
        flame.star.scale.set(starSize, starSize, 1);
        flame.starMat.opacity = ignite * .58 * cutVisible;
        flame.starMat.rotation = ca * .035 + i * .6;
      }
    }

    // camshafts (half crank speed)
    moving.cams.forEach((cam, i) => {
      cam.rotation.x = -crankRad * .5;
    });

    // timing drive
    if (moving.timingGears[0]) {
      moving.timingGears[0].group.rotation.x = -crankRad;
      moving.timingGears[1].group.rotation.x = -crankRad * .5;
      moving.timingGears[2].group.rotation.x = -crankRad * .5;
    }

    // timing chain links travel around the sprockets
    if (moving.timingChain) {
      const { curve, links } = moving.timingChain;
      const n = links.length;
      const off = (state.crank / 720) % 1;
      for (let i = 0; i < n; i++) {
        const u = (i / n + off) % 1;
        const pos = curve.getPointAt(u);
        const tan = curve.getTangentAt(u).normalize();
        links[i].position.copy(pos);
        links[i].quaternion.setFromUnitVectors(UP, tan);
      }
    }

    // turbo compressor wheel
    if (moving.turboWheel) {
      const speed = state.running ? (8 + state.rpm / RPM_MAX * 105) : .35;
      moving.turboWheel.rotation.x += dt * speed;
    }

    updateCycleUI();
  }

  function updateCamera(dt) {
    if (!dragging && autoRotate && !state.tour && performance.now() - lastInteraction > 2400) {
      cam.dTheta += dt * .032;
    }
    const ease = 1 - Math.pow(.001, dt);
    cam.theta += (cam.dTheta - cam.theta) * ease;
    cam.phi += (cam.dPhi - cam.phi) * ease;
    cam.radius += (cam.dRadius - cam.radius) * ease;
    cam.target.lerp(cam.dTarget, ease);

    const sp = Math.sin(cam.phi);
    camera.position.set(
      cam.target.x + cam.radius * sp * Math.sin(cam.theta),
      cam.target.y + cam.radius * Math.cos(cam.phi),
      cam.target.z + cam.radius * sp * Math.cos(cam.theta)
    );
    camera.lookAt(cam.target);
  }

  function updateExplode(dt) {
    explodeAmount += ((state.exploded ? 1 : 0) - explodeAmount) * Math.min(1, dt * 4.4);
    const e = explodeAmount * explodeAmount * (3 - 2 * explodeAmount);
    coverGroup.position.y = e * 1.05;
    headGroup.position.y = e * .46;
    intakeGroup.position.set(0, e * .22, -e * .5);
    exhaustGroup.position.set(0, e * .12, e * .52);
    turboGroup.position.set(3.55 + e * .62, 2.62 + e * .18, 1.16 + e * .32);
    panGroup.position.y = -e * .5;
    timingGroup.position.x = e * .3;
  }

  function updateCutaway(dt) {
    cutAmount += ((state.cutaway ? 1 : 0) - cutAmount) * Math.min(1, dt * 5.2);
    M.blockGlass.opacity = .80 - cutAmount * .73;
    M.blockGlass.depthWrite = cutAmount < .45;
    M.coverGhost.opacity = .80 - cutAmount * .72;
    M.coverGhost.depthWrite = cutAmount < .45;
    const showCut = cutAmount > .5;
    moving.linersFull.forEach(o => { o.visible = !showCut; });
    moving.linersCut.forEach(o => { o.visible = showCut; });
    frontGlass.visible = !showCut;
    frontCoverGroup.visible = !showCut;
    coverGroup.visible = !showCut;
  }

  function updateLabels() {
    if (!state.labels) return;
    const w = innerWidth, h = innerHeight;
    const safeRight = w > 840 ? w - 430 : w - 16;
    labelNodes.forEach(({ el: node, cfg }) => {
      const a = anchors[cfg.id];
      if (!a) { node.classList.remove('visible'); return; }
      a.getWorldPosition(tmpV);
      tmpV.project(camera);
      const x = (tmpV.x * .5 + .5) * w;
      const y = (-tmpV.y * .5 + .5) * h;
      const visible = tmpV.z < 1 && tmpV.z > -.9 && x > 20 && x < safeRight - 30 && y > 74 && y < h - 78;
      node.classList.toggle('visible', visible);
      if (!visible) return;
      let flip = cfg.side === 'left';
      if (flip && x < 150) flip = false;
      if (!flip && x > safeRight - 185) flip = true;
      node.classList.toggle('flip', flip);
      node.classList.toggle('active', state.selected === cfg.id);
      node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translateY(-50%)`;
    });

    if (state.selected) {
      const part = PART_BY_ID[state.selected];
      const a = part && anchors[part.anchor];
      if (a) {
        a.getWorldPosition(tmpV);
        halo.position.copy(tmpV);
        haloInner.position.copy(tmpV);
        halo.quaternion.copy(camera.quaternion);
        haloInner.quaternion.copy(camera.quaternion);
        const pulse = 1 + Math.sin(performance.now() * .0035) * .14;
        halo.scale.setScalar(pulse);
        halo.material.opacity = .38 + Math.sin(performance.now() * .0035) * .12;
        halo.visible = true;
        haloInner.visible = true;
      }
    } else {
      halo.visible = false;
      haloInner.visible = false;
    }
  }

  // collect meshes after construction
  engine.traverse(o => {
    if (o.isMesh && !o.isSprite && o.material && !o.material.transparent && o.material.visible !== false) {
      pickables.push(o);
    }
  });

  /* ── boot ─────────────────────────────────────────────────────────────── */
  renderPartList();
  updateMetrics();
  updatePartUI(PART_BY_ID[state.selected]);
  setRunning(true);
  setCutaway(true);
  setExploded(false);
  setTab('live');
  updateRotateTool();
  updateTool(el.labelsBtn, true);
  resetCamera(true);
  syncPanelChrome();

  if (reduceMotion) {
    autoRotate = false;
    updateRotateTool();
  }

  let layoutBand = -1;
  function viewBand(w) {
    if (w <= 840) return 0;
    if (w <= 1100) return 1;
    if (w <= 1280) return 2;
    return 3;
  }
  function onResize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w <= 840 ? 43 : 35;
    camera.updateProjectionMatrix();
    const band = viewBand(w);
    if (layoutBand !== -1 && band !== layoutBand) resetCamera(true);
    layoutBand = band;
    syncPanelChrome();
  }
  window.addEventListener('resize', onResize);
  onResize();

  let firstFrame = true;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05);
    const t = clock.elapsedTime;

    if (state.running) {
      const revPerSec = .18 + state.rpm / RPM_MAX * 1.75;
      state.crank = (state.crank + dt * revPerSec * 360) % 720;
    }

    updateMechanism(dt, t);
    if (state.tab === 'science' && state.sciTab === 'physics') updatePV();
    updateCamera(dt);
    updateExplode(dt);
    updateCutaway(dt);
    updateLabels();

    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      setTimeout(() => {
        loader.classList.add('hidden');
        document.body.classList.add('ready');
      }, 220);
    }
  }

  animate();
})();
