import * as THREE from 'three';

const knownOffsets = {
  'right-atrium': [-1.65, .55, .05], 'left-atrium': [1.65, 1.1, -.15],
  'ventricular-wall': [0, -1.65, -.45], 'right-ventricle': [-.65, 0, .8], 'left-ventricle': [.75, 0, .8],
  'ascending-aorta': [.35, 1.4, -.1], 'aortic-arch': [1, 2.1, -.3], 'pulmonary-trunk': [-.7, 1.55, .65],
  'superior-vena-cava': [-1.8, 1.45, -.2], 'left-coronary': [2.6, -1.55, .55], 'right-coronary': [-2.6, -1.55, .55]
};
export const clampExplosion = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export const explosionActive = (target, current) => target > 0 || current > 0;
export function nextExplosion(current, target, dt, reduceMotion = false) {
  const end = clampExplosion(target);
  if (reduceMotion || Math.abs(end - current) < .0005) return end;
  const value = current + (end - current) * (1 - Math.exp(-Math.max(0, dt) * 8));
  return Math.abs(end - value) < .0005 ? end : value;
}

export function rememberHomes(meshes, catalog) {
  const extras = [...meshes.keys()].filter(id => !knownOffsets[id]);
  for (const [id, mesh] of meshes) {
    mesh.geometry.computeBoundingBox();
    mesh.userData.explosionHome = mesh.position.clone();
    const item = catalog[id];
    let offset = knownOffsets[id] || item?.explodeOffset;
    if (!offset) {
      const index = extras.indexOf(id);
      // 新增部件按扇形分开展示；这些位置均为展示位置，尚待医学审校。
      const angle = index / Math.max(extras.length, 1) * Math.PI * 2;
      const radius = item?.kind === 'valve' || item?.kind === 'papillary' ? 3.0 : 3.7;
      offset = [Math.cos(angle) * radius, Math.sin(angle) * radius, 1.5 + index % 2 * .5];
    }
    mesh.userData.explosionOffset = new THREE.Vector3(...offset);
  }
}

export function applyExplosion(meshes, centers, amount) {
  const fitPoints = [];
  for (const [id, mesh] of meshes) {
    mesh.position.copy(mesh.userData.explosionHome).addScaledVector(mesh.userData.explosionOffset, clampExplosion(amount));
    mesh.updateMatrix();
    const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
    bounds.getCenter(centers.get(id));
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) fitPoints.push(new THREE.Vector3(x, y, z));
  }
  return fitPoints;
}
