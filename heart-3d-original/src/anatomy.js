import catalog from './catalog.json' with { type: 'json' };
export const structures = catalog;
export const byId = Object.fromEntries(structures.map(item => [item.id, item]));
export function partVisible(id, state) {
  if (state.hidden?.includes(id)) return false;
  if (state.isolated && state.selected) return id === state.selected;
  const item = byId[id];
  // 腔体包络默认隐藏，避免实体表面遮住瓣膜和腱索；仅在选中或拆分时展示。
  if (item?.kind === 'cavity') return state.selected === id || state.mode === 'exploded';
  return !(state.interior && item?.interiorWall);
}
export function chooseStructure(state, id) {
  if (!byId[id]) throw new Error(`未知结构：${id}`);
  state.selected = id;
  state.hidden = (state.hidden || []).filter(value => value !== id);
  if (['cavity','valve','papillary','chord','trabecula','septum'].includes(byId[id].kind) && state.mode === 'intact') state.interior = true;
  if (byId[id].interiorWall) state.interior = false;
  return state;
}
export function matchesSearch(item, query) {
  const text = query.trim().toLocaleLowerCase();
  return !text || [item.id,item.name,item.english,item.abbreviation,item.group].filter(Boolean).join(' ').toLocaleLowerCase().includes(text);
}
// 全局缩放仅用于节律示意，不表达真实心肌运动。
export function beatEnvelope(phase) {
  const x = ((phase % 1) + 1) % 1;
  return Math.exp(-Math.pow((x - 0.18) / 0.095, 2)) + 0.28 * Math.exp(-Math.pow((x - 0.41) / 0.08, 2));
}
