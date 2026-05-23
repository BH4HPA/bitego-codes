import type { CategoryDTO } from '../../api/types';

export function reorderList<T>(list: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return list;
  if (fromIndex < 0 || fromIndex >= list.length) return list;
  if (toIndex < 0 || toIndex >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function recalcCategorySortDesc(list: CategoryDTO[]) {
  const base = list.length * 10;
  return list.map((c, idx) => ({ ...c, sort: base - idx * 10 }));
}

export function reorderCategories(list: CategoryDTO[], fromIndex: number, toIndex: number) {
  return recalcCategorySortDesc(reorderList(list, fromIndex, toIndex));
}
