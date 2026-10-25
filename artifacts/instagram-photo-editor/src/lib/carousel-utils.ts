// Pure helpers shared by the editor. Photos and their crops move together.
export const MAX_SLOTS = 4;

export function swapItems<T>(list: T[], a: number, b: number): T[] {
  if (a === b || a < 0 || b < 0 || a >= list.length || b >= list.length) return list;
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
