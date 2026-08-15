// Shared local-state patch helper for admin mutation hooks: after a
// save (add or edit) response comes back, replace the matching item by id
// if it already exists, otherwise insert the new item - mirroring whichever
// end of the array the corresponding server-side write inserts at
// (db.<entity>.push for products/users/job-prices, db.jobEntries.unshift).
export function upsertById<T extends { id: string }>(
  list: T[],
  saved: T,
  insertAt: 'start' | 'end' = 'end'
): T[] {
  const exists = list.some(item => item.id === saved.id);
  if (exists) {
    return list.map(item => item.id === saved.id ? saved : item);
  }
  return insertAt === 'start' ? [saved, ...list] : [...list, saved];
}
