import catalog from './catalog.json' with { type: 'json' };

export const structures = catalog;
export const byId = Object.fromEntries(structures.map(item => [item.id, item]));

export function partVisible(id, state) {
  if (state.hidden?.includes(id)) return false;
  if (state.isolated && state.selected) return id === state.selected;
  return !(state.interior && id === 'ventricular-wall');
}

export function chooseStructure(state, id) {
  if (!byId[id]) throw new Error(`未知结构：${id}`);
  state.selected = id;
  state.hidden = (state.hidden || []).filter(value => value !== id);
  if (byId[id].kind === 'cavity' && state.mode === 'intact') state.interior = true;
  if (id === 'ventricular-wall') state.interior = false;
  return state;
}

export function matchesSearch(item, query) {
  const text = query.trim().toLocaleLowerCase();
  return !text || [item.name, item.english, item.abbreviation, item.fma, item.group, item.sourceName, ...(item.sourceIds || []), ...(item.sourceFmaIds || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(text);
}

// 仅作为教学演示节律，不用于表达真实心肌运动。
export function beatEnvelope(phase) {
  const x = ((phase % 1) + 1) % 1;
  return Math.exp(-Math.pow((x - 0.18) / 0.095, 2)) + 0.28 * Math.exp(-Math.pow((x - 0.41) / 0.08, 2));
}
