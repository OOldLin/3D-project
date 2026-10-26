import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { structures, byId, partVisible, chooseStructure, matchesSearch, beatEnvelope } from './anatomy.js';
import { clampExplosion, explosionActive, nextExplosion, rememberHomes, applyExplosion } from './explosion.js';
import { viewDirections, viewNames, fitDistance, getClipPlane, keptByClip, renderPixelRatio, materialColor, validateObservation } from './viewer-tools.js';

const $ = id => document.getElementById(id);
const metadata = JSON.parse($('model-metadata').textContent);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const initialState = () => ({ mode: 'intact', selected: null, hidden: [], isolated: false, interior: false, explode: 0, opacity: 28, profile: 'natural', quality: 'high', labels: true, autoFocus: true, playing: false, bpm: 72, autoRotate: false, view: 'front', clip: { axis: 'coronal', position: 50, yaw: 0, pitch: 0, flip: false, helper: true } });
let state = initialState();
let renderer, scene, camera, controls, model, planeHelper, selectionEdges, environmentMap;
let baseDistance = 8, explosionAmount = 0, previousTime = 0, phase = 0, contextLost = false, frameRequest, pointerStart, cameraTween, pendingFocus = false, programmaticPose = false;
let originalPoints = [], fitPoints = [], labelLayout = [], records = [], toastTimer;
let storageAvailable = true, labelsDirty = true, lastLabelTime = 0;
const meshes = new Map(), centers = new Map(), labelNodes = new Map();
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const raycaster = new THREE.Raycaster();
const lastRotation = new THREE.Quaternion();
const viewport = { width: 1, height: 1 };
const storageKey = 'heart-professional-observations-v2';
const modelVersion = metadata.runtime.sha256;
const svgNS = 'http://www.w3.org/2000/svg';
let labelSVG;

function notify(message) {
  $('status').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('status').textContent = ''; }, 5500);
}

function clippingActive() { return state.mode === 'cut' && explosionAmount === 0; }
function animationAllowed() { return state.mode === 'intact' && explosionAmount === 0; }

function buildCatalogue() {
  $('structure-list').replaceChildren();
  const query = $('structure-search').value;
  const filtered = structures.filter(item => matchesSearch(item, query));
  for (const group of [...new Set(filtered.map(item => item.group))]) {
    const items = filtered.filter(item => item.group === group);
    const section = document.createElement('section'); section.className = 'part-group';
    const heading = document.createElement('h3'); heading.className = 'group-heading'; heading.textContent = group;
    const count = document.createElement('span'); count.textContent = `${items.length} 个结构`; heading.append(count); section.append(heading);
    for (const item of items) {
      const row = document.createElement('div'); row.className = 'part-row'; row.dataset.row = item.id;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'part-button'; button.dataset.part = item.id; button.style.setProperty('--part-color', item.color); button.setAttribute('aria-pressed', String(state.selected === item.id));
      const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.textContent = item.name; name.title = `${item.name} · ${item.english}`;
      const abbreviation = document.createElement('small'); abbreviation.textContent = item.abbreviation || '';
      button.append(dot, name, abbreviation); button.addEventListener('click', () => selectStructure(item.id));
      const visibility = document.createElement('button'); visibility.type = 'button'; visibility.className = 'visibility-button'; visibility.dataset.visibility = item.id;
      visibility.addEventListener('click', () => { const hidden = state.hidden.includes(item.id); state.hidden = hidden ? state.hidden.filter(id => id !== item.id) : [...state.hidden, item.id]; if (!hidden && state.selected === item.id) { state.selected = null; state.isolated = false; } updateAppearance(); syncInterface(); });
      row.append(button, visibility); section.append(row);
    }
    $('structure-list').append(section);
  }
  $('search-count').textContent = `${filtered.length} / ${structures.length} 个结构`;
  $('search-empty').hidden = filtered.length > 0;
  syncCatalogue();
}

function syncCatalogue() {
  document.querySelectorAll('[data-part]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.part === state.selected)));
  document.querySelectorAll('[data-visibility]').forEach(button => {
    const id = button.dataset.visibility; const visible = partVisible(id, state);
    button.textContent = visible ? '显示' : '隐藏'; button.setAttribute('aria-pressed', String(visible)); button.setAttribute('aria-label', `${visible ? '隐藏' : '显示'}${byId[id].name}`);
    document.querySelector(`[data-row="${id}"]`)?.classList.toggle('is-hidden', !visible);
  });
}

function syncInterface() {
  labelsDirty = true;
  syncCatalogue();
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
  $('stage-mode').textContent = { intact: '完整观察', cut: explosionAmount > 0 ? '复原后显示切面' : '模型表面剖切', exploded: '结构拆分' }[state.mode];
  $('cut-panel').hidden = state.mode !== 'cut'; $('explosion-panel').hidden = state.mode !== 'exploded';
  $('view-name').textContent = viewNames[state.view]; $('view-preset').value = state.view;
  $('quality').value = state.quality; $('profile').value = state.profile;
  $('context-opacity').value = state.opacity; $('opacity-value').value = `${state.opacity}%`;
  $('labels-toggle').checked = state.labels; $('auto-focus').checked = state.autoFocus; $('auto-rotate').checked = state.autoRotate; $('interior').checked = state.interior;
  $('demo-toggle').checked = state.playing; $('demo-toggle').disabled = !animationAllowed();
  $('demo-note').textContent = animationAllowed() ? '专业观察默认静态；简化跳动不表示真实心肌运动。' : '剖切、拆分和复原期间暂停示意动画。';
  $('bpm').value = state.bpm; $('bpm-value').value = state.bpm; $('bpm').disabled = !animationAllowed();
  $('explode').value = Math.round(state.explode * 100); $('explode-value').value = `${Math.round(state.explode * 100)}%`;
  $('explode-hint').textContent = `按现有 ${structures.length} 个结构展开；展示位置不代表真实解剖位置。`;
  $('clip-axis').value = state.clip.axis; $('clip-position').value = state.clip.position; $('clip-value').value = `${state.clip.position}%`;
  $('clip-flip').checked = state.clip.flip; $('clip-helper').checked = state.clip.helper;
  $('oblique-controls').hidden = state.clip.axis !== 'oblique'; $('clip-yaw').value = state.clip.yaw; $('yaw-value').value = `${state.clip.yaw}°`; $('clip-pitch').value = state.clip.pitch; $('pitch-value').value = `${state.clip.pitch}°`;
  const item = byId[state.selected];
  $('detail-category').textContent = item ? item.group : '结构介绍'; $('detail-title').textContent = item ? item.name : '选择一个结构';
  $('detail-english').textContent = item ? `${item.english}${item.abbreviation ? ` · ${item.abbreviation}` : ''}` : '';
  $('detail-description').textContent = item ? item.description : '点击模型或结构目录，定位并查看结构。';
  $('detail-note').textContent = item ? item.note : '目录标记的是实际加载的结构。未包含的结构请查看模型清单。';
  $('detail-source').textContent = item ? [item.fma, ...(item.sourceIds || [])].filter(Boolean).join(' · ') : '来源可追溯';
  $('clear-selection').hidden = !item;
  for (const id of ['isolate', 'focus-selection', 'hide-selection']) $(id).disabled = !item;
  $('isolate').textContent = state.isolated ? '退出单独查看' : '单独查看'; $('isolate').setAttribute('aria-pressed', String(state.isolated));
  $('export-png').disabled = !model || contextLost;
}

function updateAppearance() {
  labelsDirty = true;
  for (const [id, mesh] of meshes) {
    const item = byId[id], material = mesh.material;
    const ghost = Boolean(state.selected && state.selected !== id);
    mesh.visible = partVisible(id, state);
    material.color.set(materialColor(item, state.profile));
    material.transparent = ghost && state.opacity < 100;
    material.opacity = ghost ? state.opacity / 100 : 1;
    material.depthWrite = !material.transparent;
    material.emissive.set(state.selected === id ? '#9c6449' : '#000000'); material.emissiveIntensity = state.selected === id ? .08 : 0;
    material.clippingPlanes = clippingActive() ? [clipPlane] : null;
    material.roughness = item.kind === 'wall' ? .61 : item.kind === 'valve' ? .67 : .43;
    material.clearcoat = item.kind === 'vessel' || item.kind === 'coronary' ? .18 : .08;
    material.needsUpdate = true;
  }
  if (selectionEdges) {
    selectionEdges.parent?.remove(selectionEdges); selectionEdges.geometry.dispose(); selectionEdges.material.dispose(); selectionEdges = null;
  }
  if (state.selected && meshes.has(state.selected)) {
    const selected = meshes.get(state.selected);
    selectionEdges = new THREE.LineSegments(new THREE.EdgesGeometry(selected.geometry, 34), new THREE.LineBasicMaterial({ color: '#f2c2a0', transparent: true, opacity: .38, depthWrite: false, clippingPlanes: clippingActive() ? [clipPlane] : null }));
    selectionEdges.renderOrder = 3; selected.add(selectionEdges);
  }
  if (planeHelper) planeHelper.visible = clippingActive() && state.clip.helper;
}

function updateClipping() {
  if (!model) return;
  labelsDirty = true;
  clipPlane.copy(getClipPlane(state.clip, originalPoints));
  if (planeHelper) { planeHelper.visible = clippingActive() && state.clip.helper; planeHelper.updateMatrixWorld(true); }
  for (const mesh of meshes.values()) { const before=mesh.material.clippingPlanes?.length||0;mesh.material.clippingPlanes=clippingActive()?[clipPlane]:null;if(before!==(mesh.material.clippingPlanes?.length||0))mesh.material.needsUpdate=true; }
  if (selectionEdges) { const before=selectionEdges.material.clippingPlanes?.length||0;selectionEdges.material.clippingPlanes=clippingActive()?[clipPlane]:null;if(before!==(selectionEdges.material.clippingPlanes?.length||0))selectionEdges.material.needsUpdate=true; }
}

function setMode(mode) {
  state.mode = mode; state.autoRotate = false; cameraTween = null;if(controls)controls.enableDamping=!motion.matches;
  if (mode === 'exploded') { state.explode = Math.max(state.explode, 1); state.interior = false; state.isolated = false; state.hidden = []; }
  else state.explode = 0;
  updateClipping(); updateAppearance(); syncInterface();
}

function selectStructure(id) {
  chooseStructure(state, id); updateAppearance(); syncInterface();
  if (state.autoFocus) { if (explosionAmount !== state.explode) pendingFocus = true; else focusSelection(); }
}

function showAll() { state.selected = null; state.hidden = []; state.isolated = false; state.interior = false; updateAppearance(); syncInterface(); }

function direction() { return camera.position.clone().sub(controls.target).normalize(); }
function fitted(points = fitPoints, target = controls.target, dir = direction()) { return fitDistance(points, dir, camera.fov, camera.aspect, target); }
function updateLimits() { controls.minDistance = .18; controls.maxDistance = Math.max(150, baseDistance * 3); }

function refitPreservingZoom() {
  if (!model || cameraTween) return;
  const ratio = camera.position.distanceTo(controls.target) / baseDistance;
  const dir = direction();
  baseDistance = fitted(); updateLimits();
  camera.position.copy(controls.target).addScaledVector(dir, baseDistance * Math.max(.02, ratio));
}

function animateCamera(target, position, view = 'free') {
  state.autoRotate = false; state.view = view;
  cameraTween = { from: camera.position.clone(), targetFrom: controls.target.clone(), to: position.clone(), targetTo: target.clone(), elapsed: 0, duration: motion.matches ? 0 : .7 };
  controls.enableDamping = false;
  if (motion.matches) advanceCamera(1);
  syncInterface();
}

function advanceCamera(dt) {
  if (!cameraTween) return;
  const tween = cameraTween; tween.elapsed += dt;
  const t = tween.duration ? Math.min(tween.elapsed / tween.duration, 1) : 1;
  const eased = t * t * (3 - 2 * t);
  programmaticPose = true;
  camera.position.lerpVectors(tween.from, tween.to, eased); controls.target.lerpVectors(tween.targetFrom, tween.targetTo, eased); camera.lookAt(controls.target); controls.update();
  lastRotation.copy(camera.quaternion); programmaticPose = false;
  if (t === 1) { cameraTween = null; controls.enableDamping = !motion.matches; baseDistance = fitted(); updateLimits(); }
}

function setView(view, immediate = false) {
  if (!camera || !model || !viewDirections[view]) return;
  const dir = new THREE.Vector3(...viewDirections[view]).normalize();
  const target = new THREE.Vector3(); baseDistance = fitted(fitPoints, target, dir); updateLimits();
  const position = dir.multiplyScalar(baseDistance);
  if (immediate) { cameraTween = null; programmaticPose = true; controls.target.copy(target); camera.position.copy(position); camera.lookAt(target); controls.update(); lastRotation.copy(camera.quaternion); programmaticPose = false; state.view = view; syncInterface(); }
  else animateCamera(target, position, view);
}

function focusSelection() {
  const mesh = meshes.get(state.selected); if (!mesh || !mesh.visible) return;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh); const target = bounds.getCenter(new THREE.Vector3());
  let dir = direction();
  if (state.selected === 'left-atrium' && state.mode === 'intact') dir = new THREE.Vector3(.25, .15, -1).normalize();
  const points = []; for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z));
  const distance = Math.max(.8, fitted(points, target, dir) * 1.20);
  animateCamera(target, target.clone().addScaledVector(dir, distance));
}

function zoom(factor) {
  if (!camera) return; cameraTween = null;controls.enableDamping=!motion.matches;
  const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset); controls.update();
}

function resize() {
  if (!renderer || !camera) return;
  const host = $('canvas-host'); const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
  const changed = viewport.width !== width || viewport.height !== height;
  const ratio = camera.position.distanceTo(controls.target) / baseDistance;
  viewport.width = width; viewport.height = height;
  renderer.setPixelRatio(renderPixelRatio(width, height, state.quality, devicePixelRatio || 1)); renderer.setSize(width, height);
  camera.aspect = width / height; camera.updateProjectionMatrix();
  if (model && changed) { cameraTween = null; const dir = direction(); baseDistance = fitted(); camera.position.copy(controls.target).addScaledVector(dir, baseDistance * ratio); updateLimits(); controls.update(); }
  labelsDirty = true;
}

function updateOrientation() {
  const canvas = $('orientation'), ctx = canvas.getContext('2d'); if (!ctx || !camera) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height); const q = camera.quaternion.clone().invert();
  const axes = [['L', [1,0,0]], ['R', [-1,0,0]], ['S', [0,1,0]], ['I', [0,-1,0]], ['A', [0,0,1]], ['P', [0,0,-1]]].map(([label, axis]) => ({ label, vector: new THREE.Vector3(...axis).applyQuaternion(q) })).sort((a,b) => a.vector.z - b.vector.z);
  ctx.font = '20px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const {label,vector} of axes) { const x=112+vector.x*65, y=112-vector.y*65; ctx.strokeStyle=vector.z<-.1?'#7b8b9c55':'#c5b4a7aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(112,112);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle=vector.z<-.1?'#8b9bad77':'#e6d6c4';ctx.fillText(label,112+vector.x*85,112-vector.y*85); }
}

function labelAnchor(mesh) {
  const anchor = centers.get(mesh.name).clone(); model.localToWorld(anchor);
  if (keptByClip(anchor, clipPlane, clippingActive())) return anchor;
  const positions = mesh.geometry.getAttribute('position'); const candidate = new THREE.Vector3(); let best = null, bestDistance = Infinity;
  for (let i=0;i<positions.count;i+=Math.max(1,Math.floor(positions.count/100))) { candidate.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld); if(keptByClip(candidate,clipPlane,clippingActive())) { const distance=candidate.distanceToSquared(anchor); if(distance<bestDistance){best=candidate.clone();bestDistance=distance;} } }
  return best;
}

function updateLabels() {
  if (!camera || !model) return;
  const layout = [], limit = viewport.width < 550 ? 4 : 8;
  for (const node of labelNodes.values()) node.hidden = true;
  labelSVG.replaceChildren();
  const items = structures.filter(item => meshes.get(item.id)?.visible).sort((a,b) => Number(b.id===state.selected)-Number(a.id===state.selected));
  for (const item of items) {
    if ((!state.labels && item.id !== state.selected) || layout.length >= limit) continue;
    const mesh=meshes.get(item.id), anchor=labelAnchor(mesh); if(!anchor)continue;
    const projected=anchor.clone().project(camera); if(projected.z< -1 || projected.z>1 || Math.abs(projected.x)>.95 || Math.abs(projected.y)>.84)continue;
    const distance=camera.position.distanceTo(anchor);
    if(item.id!==state.selected) { raycaster.set(camera.position,anchor.clone().sub(camera.position).normalize()); const occluded=raycaster.intersectObjects([...meshes.values()].filter(other=>other!==mesh&&other.visible&&other.material.opacity>.6),false).some(hit=>hit.distance<distance-.04&&keptByClip(hit.point,clipPlane,clippingActive())); if(occluded)continue; }
    const px=(projected.x*.5+.5)*viewport.width,py=(-projected.y*.5+.5)*viewport.height;
    const w=Math.min(viewport.width<550?126:170,Math.max(70,item.name.length*11+16)),h=26;
    let x=px<viewport.width/2?px-w-22:px+22; x=THREE.MathUtils.clamp(x,12,viewport.width-w-12);
    let y=THREE.MathUtils.clamp(py-h/2,65,viewport.height-112);
    for(let attempt=0;attempt<9;attempt++){if(!layout.some(other=>x<other.x+other.w+5&&x+w>other.x-5&&y<other.y+other.h+5&&y+h>other.y-5))break;y=THREE.MathUtils.clamp(py+(attempt%2?1:-1)*Math.ceil((attempt+1)/2)*31,65,viewport.height-112);}
    if(layout.some(other=>x<other.x+other.w+5&&x+w>other.x-5&&y<other.y+other.h+5&&y+h>other.y-5))continue;
    const node=labelNodes.get(item.id); node.hidden=false;node.classList.toggle('selected',item.id===state.selected);node.style.left=`${x}px`;node.style.top=`${y}px`;node.style.maxWidth=`${w}px`;
    const path=document.createElementNS(svgNS,'path');const endX=px<x?x:x+w;path.setAttribute('d',`M ${px} ${py} L ${endX} ${y+h/2}`);if(item.id===state.selected)path.setAttribute('class','selected');labelSVG.append(path);
    layout.push({id:item.id,name:item.name,x,y,w,h,px,py});
  }
  labelLayout=layout;
}

function animate(time) {
  frameRequest=requestAnimationFrame(animate);
  const dt=previousTime?Math.min((time-previousTime)/1000,.05):0;previousTime=time;
  if(document.hidden||contextLost)return;
  if(model){const next=nextExplosion(explosionAmount,state.explode,dt,motion.matches);if(next!==explosionAmount){explosionAmount=next;fitPoints=applyExplosion(meshes,centers,next);refitPreservingZoom();updateClipping();if(next===state.explode){syncInterface();if(pendingFocus){pendingFocus=false;focusSelection();}}}
    const beating=state.playing&&animationAllowed();if(beating){phase=(phase+dt*state.bpm/60)%1;labelsDirty=true;}const beat=beating?beatEnvelope(phase):0;model.scale.set(1-beat*.032,1-beat*.045,1-beat*.025);}
  advanceCamera(dt);controls.autoRotate=state.autoRotate&&!cameraTween;controls.update(dt);
  renderer.render(scene,camera);
  if(labelsDirty&&time-lastLabelTime>90){updateLabels();updateOrientation();lastLabelTime=time;labelsDirty=false;}
}

function pick(event) {
  if(!model||!pointerStart||pointerStart.id!==event.pointerId)return;const start=pointerStart;pointerStart=null;
  if(start.multi||start.dragged||Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return;
  const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=raycaster.intersectObjects([...meshes.values()].filter(mesh=>mesh.visible),false).find(hit=>keptByClip(hit.point,clipPlane,clippingActive()));if(hit)selectStructure(hit.object.name);
}

async function loadModel(){
  const source=$('heart-model');let buffer;
  if(source.dataset.src){const response=await fetch(source.dataset.src);if(!response.ok)throw new Error(`模型文件读取失败：${response.status}`);buffer=await response.arrayBuffer();}
  else buffer=Uint8Array.from(atob(source.textContent.trim()),char=>char.charCodeAt(0)).buffer;
  const gltf=await new GLTFLoader().parseAsync(buffer,'');model=gltf.scene;
  model.traverse(object=>{if(!object.isMesh)return;const id=object.userData.structureId||object.name;if(!byId[id]||meshes.has(id))throw new Error(`结构映射不一致：${id}`);object.name=id;object.userData.structureId=id;object.material.dispose();object.material=new THREE.MeshPhysicalMaterial({color:materialColor(byId[id],state.profile),metalness:0,roughness:.6,clearcoat:.1,clearcoatRoughness:.5,envMapIntensity:.35,side:THREE.DoubleSide});object.geometry.computeBoundingBox();centers.set(id,new THREE.Vector3());meshes.set(id,object);});
  if(meshes.size!==structures.length)throw new Error('模型结构清单与实际网格数量不一致。');
  const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());for(const mesh of meshes.values())mesh.position.sub(center);
  rememberHomes(meshes,byId);originalPoints=applyExplosion(meshes,centers,0);fitPoints=originalPoints;scene.add(model);
  planeHelper=new THREE.PlaneHelper(clipPlane,bounds.getSize(new THREE.Vector3()).length()*1.1,'#b6c6d6');planeHelper.material.transparent=true;planeHelper.material.opacity=.45;for(const child of planeHelper.children){child.material.transparent=true;child.material.opacity=.025;child.material.depthWrite=false;}planeHelper.visible=false;scene.add(planeHelper);
  labelSVG=document.createElementNS(svgNS,'svg');labelSVG.classList.add('label-lines');$('labels-layer').append(labelSVG);
  for(const item of structures){const label=document.createElement('div');label.className='structure-label';label.textContent=item.name;label.title=`${item.name} · ${item.english}`;label.hidden=true;$('labels-layer').append(label);labelNodes.set(item.id,label);}
  updateClipping();updateAppearance();setView('front',true);controls.saveState();$('loading').hidden=true;syncInterface();
  window.heartExplorerInfo=Object.freeze({version:'2.0',model:metadata.dataset,structures:[...meshes.keys()],sha256:modelVersion,medicalReview:'pending',revision:THREE.REVISION});
}

function showError(error){console.error('三维观察启动失败：',error);$('loading').hidden=true;$('graphics-error').hidden=false;$('graphics-error-text').textContent=`请使用支持 WebGL 的新版 Chrome 或 Edge。错误信息：${error.message||error}`;}

function snapshot(){return {schema:2,modelVersion,name:$('observation-name').value.trim()||`观察 ${records.length+1}`,savedAt:new Date().toISOString(),state:{mode:state.mode,explode:state.explode,selected:state.selected,hidden:[...state.hidden],isolated:state.isolated,interior:state.interior,profile:state.profile,quality:state.quality,opacity:state.opacity,labels:state.labels,view:state.view,clip:{...state.clip}},camera:{position:camera.position.toArray(),target:controls.target.toArray()}};}

function updateRecordList(){const list=$('observation-list');list.replaceChildren(new Option('选择已保存记录',''));records.forEach((record,index)=>list.add(new Option(record.name,String(index))));}
function saveRecord(record){records.push(record);if(records.length>20)records.shift();try{localStorage.setItem(storageKey,JSON.stringify(records));storageAvailable=true;}catch{storageAvailable=false;}updateRecordList();$('observation-list').value=String(records.length-1);}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function safeName(value){return String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,60)||'heart-observation';}

function restoreObservation(record){
  const value=validateObservation(record,structures.map(item=>item.id),modelVersion);cameraTween=null;pendingFocus=false;
  state={...initialState(),...value.state,playing:false,autoRotate:false};explosionAmount=state.explode;model.scale.setScalar(1);fitPoints=applyExplosion(meshes,centers,explosionAmount);
  programmaticPose=true;controls.enableDamping=false;controls.update();controls.target.fromArray(value.camera.target);camera.position.fromArray(value.camera.position);camera.lookAt(controls.target);controls.update();lastRotation.copy(camera.quaternion);programmaticPose=false;controls.enableDamping=!motion.matches;baseDistance=fitted();updateLimits();
  $('observation-name').value=value.name;updateClipping();updateAppearance();resize();syncInterface();notify(`已读取：${value.name}`);
}

function populateModelInfo(){
  $('part-count').textContent=structures.length;$('model-summary').textContent=`${metadata.dataset} ${metadata.version} · ${structures.length} 个结构 · 医学复核待完成`;
  const facts=[['模型版本',`${metadata.dataset} ${metadata.version}`],['来源核验',metadata.sourceStatus||'来源文件与哈希已记录；医学复核待完成'],['结构数量',`${structures.length} 个可选择网格`],['物理单位',metadata.units?.note||'单位换算尚未审核；不提供临床测量'],['修改记录',(metadata.modifications||[]).join('；')],['模型校验值',modelVersion]];
  for(const [name,value]of facts){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;$('model-facts').append(dt,dd);}
  for(const item of metadata.coverage||[]){const row=document.createElement('div');row.className='coverage-row';const name=document.createElement('span'),value=document.createElement('span');name.textContent=item.name;value.textContent=item.status;row.append(name,value);$('coverage-list').append(row);}
  $('model-credit').textContent=metadata.credit||'BodyParts3D, © The Database Center for Life Science. 模型许可详见项目资源说明。';
}

async function exportPNG(){
  if(!model||contextLost)return;$('export-png').disabled=true;
  const oldRatio=renderer.getPixelRatio(),oldSize=renderer.getSize(new THREE.Vector2());const width=Math.max(2560,Math.round(viewport.width*2)),height=Math.round(width*viewport.height/viewport.width),scale=width/viewport.width;
  try{renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.render(scene,camera);const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height+224;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建图片画布');ctx.fillStyle='#18222f';ctx.fillRect(0,0,width,canvas.height);ctx.drawImage(renderer.domElement,0,0,width,height);
    ctx.lineWidth=Math.max(1,scale);ctx.font=`${Math.round(11*scale)}px Microsoft YaHei, sans-serif`;ctx.textBaseline='middle';
    for(const label of labelLayout){ctx.strokeStyle=label.id===state.selected?'#f4c2a0':'#aab9c7';ctx.beginPath();ctx.moveTo(label.px*scale,label.py*scale);const ex=label.px<label.x?label.x:label.x+label.w;ctx.lineTo(ex*scale,(label.y+label.h/2)*scale);ctx.stroke();ctx.fillStyle='#121d29';ctx.fillRect(label.x*scale,label.y*scale,label.w*scale,label.h*scale);ctx.fillStyle=label.id===state.selected?'#ffe4c7':'#dce6ee';ctx.fillText(label.name,(label.x+7)*scale,(label.y+label.h/2)*scale,(label.w-14)*scale);}
    ctx.drawImage($('orientation'),width-170,45,140,140);ctx.fillStyle='#f0e0cd';ctx.font='25px Microsoft YaHei, sans-serif';ctx.fillText(`心脏解剖 · ${viewNames[state.view]} · ${{intact:'完整观察',cut:'模型表面剖切',exploded:'结构拆分'}[state.mode]}`,30,height+34);
    ctx.font='17px Microsoft YaHei, sans-serif';ctx.fillStyle='#bdcbd9';ctx.fillText(`模型：${metadata.dataset} ${metadata.version}  |  ${structures.length} 个结构  |  医学复核待完成`,30,height+70);ctx.fillText(`选中：${byId[state.selected]?.name||'无'}  |  隐藏：${structures.filter(item=>!partVisible(item.id,state)).length}  |  切面：${state.mode==='cut'?`${state.clip.axis} ${state.clip.position}%${state.clip.flip?' 反向':''}`:'未启用'}  |  L左 R右 A前 P后 S上 I下`,30,height+102);
    ctx.font='14px Microsoft YaHei, sans-serif';ctx.fillStyle='#98aabd';ctx.fillText(metadata.credit,30,height+136,width-60);ctx.fillText(`模型 SHA-256：${modelVersion} · 网格剖切不是影像切片`,30,height+162,width-60);ctx.fillText(`来源：https://lifesciencedb.jp/bp3d/  许可：${metadata.licenseUrl}`,30,height+187,width-60);ctx.fillText('显示修改：材质、配色、观察视角和剖切/拆分；下腔静脉人工截短。派生图像按模型同许可分享。',30,height+210,width-60);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('图片生成失败');downloadBlob(blob,`${safeName($('observation-name').value||'心脏解剖观察')}.png`);notify('高清图片已生成，包含模型来源、方向和医学审核状态。');
  }catch(error){notify(`导出失败：${error.message}`);}finally{renderer.setPixelRatio(oldRatio);renderer.setSize(oldSize.x,oldSize.y,false);renderer.render(scene,camera);syncInterface();}
}

function bindInterface(){
  populateModelInfo();buildCatalogue();
  $('structure-search').addEventListener('input',buildCatalogue);
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  $('quality').addEventListener('change',event=>{state.quality=event.target.value;resize();});
  $('profile').addEventListener('change',event=>{state.profile=event.target.value;updateAppearance();});
  $('context-opacity').addEventListener('input',event=>{state.opacity=Number(event.target.value);updateAppearance();syncInterface();});
  $('labels-toggle').addEventListener('change',event=>{state.labels=event.target.checked;labelsDirty=true;});$('auto-focus').addEventListener('change',event=>{state.autoFocus=event.target.checked;});
  $('auto-rotate').addEventListener('change',event=>{state.autoRotate=event.target.checked;cameraTween=null;if(state.autoRotate)state.view='free';syncInterface();});
  $('interior').addEventListener('change',event=>{state.interior=event.target.checked;state.isolated=false;if(state.interior&&state.selected==='ventricular-wall')state.selected=null;updateAppearance();syncInterface();});
  $('demo-toggle').addEventListener('change',event=>{state.playing=event.target.checked&&animationAllowed();syncInterface();});$('bpm').addEventListener('input',event=>{state.bpm=Number(event.target.value);$('bpm-value').value=state.bpm;});
  $('explode').addEventListener('input',event=>{state.explode=clampExplosion(Number(event.target.value)/100);state.mode='exploded';syncInterface();});$('explode-toggle').addEventListener('click',()=>{state.explode=1;syncInterface();});$('assemble').addEventListener('click',()=>setMode('intact'));
  $('clip-axis').addEventListener('change',event=>{state.clip.axis=event.target.value;updateClipping();syncInterface();});
  for(const [id,key]of [['clip-position','position'],['clip-yaw','yaw'],['clip-pitch','pitch']])$(id).addEventListener('input',event=>{state.clip[key]=Number(event.target.value);updateClipping();syncInterface();});
  for(const [id,key]of [['clip-flip','flip'],['clip-helper','helper']])$(id).addEventListener('change',event=>{state.clip[key]=event.target.checked;updateClipping();syncInterface();});
  $('view-preset').addEventListener('change',event=>setView(event.target.value));$('zoom-in').addEventListener('click',()=>zoom(.82));$('zoom-out').addEventListener('click',()=>zoom(1.22));
  $('reset').addEventListener('click',()=>{state=initialState();explosionAmount=0;pendingFocus=false;cameraTween=null;if(model){model.scale.setScalar(1);fitPoints=applyExplosion(meshes,centers,0);}updateClipping();updateAppearance();setView('front');syncInterface();});
  $('restore').addEventListener('click',showAll);$('clear-selection').addEventListener('click',()=>{state.selected=null;state.isolated=false;updateAppearance();syncInterface();});
  $('focus-selection').addEventListener('click',focusSelection);$('isolate').addEventListener('click',()=>{if(state.selected){state.isolated=!state.isolated;updateAppearance();syncInterface();if(state.isolated)focusSelection();}});
  $('hide-selection').addEventListener('click',()=>{if(state.selected){state.hidden.push(state.selected);state.selected=null;state.isolated=false;updateAppearance();syncInterface();}});
  $('reload').addEventListener('click',()=>location.reload());$('export-png').addEventListener('click',exportPNG);
  $('save-observation').addEventListener('click',()=>{if(!model)return notify('模型尚未加载完成。');if(explosionAmount!==state.explode||cameraTween)return notify('请等待视角或拆分动画结束后保存。');saveRecord(snapshot());notify(storageAvailable?'观察记录已保存在本浏览器。':'浏览器不允许持久保存，记录暂存在当前页面；请导出 JSON。');});
  $('load-observation').addEventListener('click',()=>{if(!model)return notify('模型尚未加载完成。');const value=$('observation-list').value;if(value==='')return notify('请先选择观察记录。');try{restoreObservation(records[Number(value)]);}catch(error){notify(error.message);}});
  $('download-observation').addEventListener('click',()=>{if(!model)return notify('模型尚未加载完成。');if(explosionAmount!==state.explode||cameraTween)return notify('请等待动画结束后导出。');const record=snapshot();downloadBlob(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),`${safeName(record.name)}.json`);});
  $('import-observation').addEventListener('click',()=>$('observation-file').click());$('observation-file').addEventListener('change',async event=>{const file=event.target.files[0];try{if(!model)throw new Error('模型尚未加载完成。');if(!file)return;if(file.size>128000)throw new Error('记录文件过大，请选择本工具导出的 JSON。');const record=validateObservation(JSON.parse(await file.text()),structures.map(item=>item.id),modelVersion);restoreObservation(record);saveRecord(record);}catch(error){notify(`读取失败：${error.message}`);}finally{event.target.value='';}});
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))records=saved.map(record=>{try{return validateObservation(record,structures.map(item=>item.id),modelVersion);}catch{return null;}}).filter(Boolean).slice(-20);}catch{storageAvailable=false;}updateRecordList();
  const dialog=$('about-dialog');let returnFocus;for(const id of ['about-open','about-footer'])$(id).addEventListener('click',event=>{returnFocus=event.currentTarget;dialog.showModal();});$('about-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>returnFocus?.focus());
  motion.addEventListener('change',event=>{if(event.matches){state.playing=false;state.autoRotate=false;}if(controls)controls.enableDamping=!event.matches;syncInterface();});document.addEventListener('visibilitychange',()=>{previousTime=0;});syncInterface();
}

async function init(){
  bindInterface();
  try{scene=new THREE.Scene();renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.localClippingEnabled=true;
    const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();environmentMap=pmrem.fromScene(room,.04);scene.environment=environmentMap.texture;room.dispose();pmrem.dispose();
    const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','心脏三维解剖模型。拖动旋转，滚轮或双指缩放。方向键旋转，加减键缩放。可通过结构目录选择和隐藏部件。');$('canvas-host').append(canvas);
    camera=new THREE.PerspectiveCamera(32,1,.05,500);camera.position.set(0,0,baseDistance);controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableDamping=!motion.matches;controls.dampingFactor=.09;controls.rotateSpeed=.6;controls.zoomSpeed=.75;controls.autoRotateSpeed=.7;lastRotation.copy(camera.quaternion);
    controls.addEventListener('change',()=>{labelsDirty=true;if(!programmaticPose&&!cameraTween&&1-Math.abs(lastRotation.dot(camera.quaternion))>1e-8){state.view='free';$('view-name').textContent=viewNames.free;$('view-preset').value='free';}lastRotation.copy(camera.quaternion);});
    controls.addEventListener('start',()=>{cameraTween=null;pendingFocus=false;controls.enableDamping=!motion.matches;state.autoRotate=false;syncInterface();});
    scene.add(new THREE.HemisphereLight('#fff3e6','#33445c',.95));const key=new THREE.DirectionalLight('#fff2e2',2.7);key.position.set(-3,4,6);scene.add(key);const fill=new THREE.DirectionalLight('#dce9ff',.9);fill.position.set(4,1,2);scene.add(fill);const rim=new THREE.DirectionalLight('#f2d8c6',1.6);rim.position.set(-3,2,-4);scene.add(rim);
    canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;if(pointerStart)pointerStart.multi=true;else pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,multi:false,dragged:false};});canvas.addEventListener('pointermove',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>6)pointerStart.dragged=true;});canvas.addEventListener('pointerup',pick);canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
    canvas.addEventListener('keydown',event=>{if(event.key.startsWith('Arrow')){event.preventDefault();cameraTween=null;state.autoRotate=false;const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));spherical.theta+=event.key==='ArrowLeft'?-.12:event.key==='ArrowRight'?.12:0;spherical.phi+=event.key==='ArrowUp'?-.12:event.key==='ArrowDown'?.12:0;spherical.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));camera.lookAt(controls.target);controls.update();state.view='free';syncInterface();}else if(['+','='].includes(event.key)){event.preventDefault();zoom(.9);}else if(event.key==='-'){event.preventDefault();zoom(1.1);}else if(event.key==='Escape')showAll();});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;cancelAnimationFrame(frameRequest);showError(new Error('WebGL 上下文已中断，请重新加载。'));});new ResizeObserver(resize).observe($('canvas-host'));resize();await loadModel();frameRequest=requestAnimationFrame(animate);
  }catch(error){showError(error);}
}
init();
