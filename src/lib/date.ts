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

// Raw <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm", no timezone) -
// pure string rearrangement like formatDateLabel, not a Date object, so a
// local-time literal can never get reinterpreted through the wrong timezone
// (same reasoning as server.ts's late-fee calc comment on this exact string
// shape). Used only for an input's display overlay; the underlying value/state
// stays untouched.
export function formatDateTimeInputLabel(value: string): string {
  const [datePart, timePart] = value.split('T');
  return timePart ? `${formatDateLabel(datePart)}, ${timePart}` : formatDateLabel(datePart);
}

// "Today" as YYYY-MM-DD - same UTC-based convention already used ad hoc for
// this across the app (server.ts's GET /api/stats, OverviewTab.tsx,
// useJobEntryActions.ts's default entryDate), centralized here since the
// default date-filter range below needs to build on the exact same value.
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

// Default range for every admin date-range filter: first day of the current
// month through today (both inclusive) - e.g. on 2026-07-31 this is
// 2026-07-01..2026-07-31; on 2026-08-03 it's 2026-08-01..2026-08-03.
export function getDefaultDateRange(): { from: string; to: string } {
  const today = getTodayDateString();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
