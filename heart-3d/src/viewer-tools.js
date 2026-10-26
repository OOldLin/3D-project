import * as THREE from 'three';

export const viewDirections = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0], superior: [0, 1, .001], inferior: [0, -1, .001] };
export const viewNames = { front: '前面观', back: '后面观', left: '左侧面观', right: '右侧面观', superior: '上面观', inferior: '下面观', free: '自由视角' };

export function fitDistance(points, direction, fov, aspect, center = new THREE.Vector3()) {
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  if (right.lengthSq() < .01) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanH = tanV * Math.max(aspect, .1);
  let distance = .5;
  for (const point of points) {
    const p = point.clone().sub(center);
    distance = Math.max(distance, p.dot(direction) + Math.abs(p.dot(right)) / (tanH * .88), p.dot(direction) + Math.abs(p.dot(up)) / (tanV * .84));
  }
  return distance * 1.025;
}

export function getClipPlane(clip, points) {
  let normal;
  if (clip.axis === 'transverse') normal = new THREE.Vector3(0, 1, 0);
  else if (clip.axis === 'sagittal') normal = new THREE.Vector3(1, 0, 0);
  else if (clip.axis === 'oblique') {
    const yaw = THREE.MathUtils.degToRad(clip.yaw);
    const pitch = THREE.MathUtils.degToRad(clip.pitch);
    normal = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  } else normal = new THREE.Vector3(0, 0, 1);
  normal.normalize();
  const extents = points.map(point => point.dot(normal));
  const min = Math.min(...extents);
  const max = Math.max(...extents);
  const position = THREE.MathUtils.lerp(min - .02, max + .02, Math.max(0, Math.min(100, clip.position)) / 100);
  const plane = new THREE.Plane(normal.clone(), -position);
  if (clip.flip) plane.negate();
  return plane;
}

export function keptByClip(point, plane, active) {
  return !active || plane.distanceToPoint(point) >= -1e-6;
}

export function renderPixelRatio(width, height, quality, deviceRatio = 1) {
  const wanted = quality === 'high' ? Math.min(Math.max(deviceRatio, 2), 2.5) : Math.min(deviceRatio, 1.75);
  const budget = quality === 'high' ? 7000000 : 3500000;
  return Math.max(.75, Math.min(wanted, Math.sqrt(budget / Math.max(1, width * height))));
}

export function materialColor(item, profile) {
  if (profile === 'structure') return item.color;
  if (item.kind === 'cavity') return item.id.includes('right') ? '#789daf' : '#df9985';
  if (item.kind === 'valve') return '#e1c6aa';
  if (item.kind === 'papillary') return '#c27d70';
  if (item.kind === 'coronary') return '#d3aa8a';
  if (item.kind === 'vessel') return /vena|vein/.test(item.id) ? '#9b7f8e' : '#c47b72';
  return item.id.includes('atrium') ? '#b87973' : '#ad5a53';
}

// 只接受已知字段和有限数值，观察记录不会被当成脚本执行。
export function validateObservation(input, ids, version) {
  const record = input?.observation || input;
  if (!record || record.schema !== 2 || record.modelVersion !== version) throw new Error('观察记录的格式或模型版本不匹配。');
  const state = record.state;
  if (!state || !['intact', 'cut', 'exploded'].includes(state.mode)) throw new Error('观察方式无效。');
  const vector = value => Array.isArray(value) && value.length === 3 && value.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 10000);
  if (!vector(record.camera?.position) || !vector(record.camera?.target)) throw new Error('记录中的相机位置无效。');
  const distance = new THREE.Vector3(...record.camera.position).distanceTo(new THREE.Vector3(...record.camera.target));
  if (distance < .1 || distance > 1000) throw new Error('相机距离超出允许范围。');
  if (!state.clip || !['coronal', 'sagittal', 'transverse', 'oblique'].includes(state.clip.axis)) throw new Error('切面方向无效。');
  for (const [key, min, max] of [['position', 0, 100], ['yaw', -180, 180], ['pitch', -89, 89]]) if (!Number.isFinite(state.clip[key]) || state.clip[key] < min || state.clip[key] > max) throw new Error('切面参数无效。');
  if (!Number.isFinite(state.explode) || state.explode < 0 || state.explode > 1 || !Number.isFinite(state.opacity) || state.opacity < 10 || state.opacity > 100) throw new Error('显示参数无效。');
  if (state.mode !== 'exploded' && state.explode !== 0) throw new Error('观察方式与拆分程度不一致。');
  if (state.selected !== null && !ids.includes(state.selected)) throw new Error('记录中的选中结构不存在。');
  if (!Array.isArray(state.hidden) || state.hidden.some(id => !ids.includes(id))) throw new Error('记录中包含未知结构。');
  return {
    schema: 2, modelVersion: version, name: String(record.name || '导入观察').slice(0, 60), savedAt: String(record.savedAt || ''),
    state: { mode: state.mode, explode: state.explode, selected: state.selected, hidden: [...new Set(state.hidden)], isolated: Boolean(state.isolated), interior: Boolean(state.interior), profile: state.profile === 'natural' ? 'natural' : 'structure', quality: state.quality === 'standard' ? 'standard' : 'high', opacity: state.opacity, labels: Boolean(state.labels), view: Object.hasOwn(viewNames, state.view) ? state.view : 'free', clip: { axis: state.clip.axis, position: state.clip.position, yaw: state.clip.yaw, pitch: state.clip.pitch, flip: Boolean(state.clip.flip), helper: Boolean(state.clip.helper) } },
    camera: { position: [...record.camera.position], target: [...record.camera.target] }
  };
}
