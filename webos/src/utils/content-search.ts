export function filterByTitle<T>(
  items: T[],
  query: string,
  titleFor: (item: T) => string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    titleFor(item).toLowerCase().includes(needle),
  );
}
