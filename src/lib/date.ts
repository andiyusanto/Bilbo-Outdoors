// Shared date-display helpers - reformats every displayed date to dd-mm-yyyy.

// Plain "YYYY-MM-DD" strings (order/job dates - never carry a time component) -
// parsed via direct string split, not `new Date(...)`, so this can never be
// thrown off by timezone offset the way this project has been bitten before
// (see CLAUDE.md's DATE-oid parsing note) - it's pure text rearrangement.
export function formatDateLabel(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

// Real instants (Date object or full ISO datetime string, e.g. createdAt, a
// computed deadline) - keeps the existing time-of-day portion/format exactly
// as before, only reformats the date portion to dd-mm-yyyy.
export function formatDateTimeLabel(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${dd}-${mm}-${d.getFullYear()}, ${time}`;
}
