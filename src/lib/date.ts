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

// Local calendar-day portion ("YYYY-MM-DD") of a real instant (createdAt,
// rejectedAt, etc.) - local getters, NOT `.toISOString().split('T')[0]`,
// which is UTC and misreports the day during WIB's local-midnight-to-07:00
// gap - the exact same reasoning getTodayDateString below already documents,
// just applied to an arbitrary instant instead of "now".
export function localDateFromInstant(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Adds `days` calendar days to a plain "YYYY-MM-DD" string, returning the
// same plain format - used for an exclusive minimum (e.g. "the day after
// this one") on a date input's `min` attribute. Parses as local midnight
// (`T00:00:00`, no timezone suffix) rather than a bare `new Date(dateStr)`
// (UTC midnight), so day-of-month arithmetic can't be thrown off by the
// local/UTC offset - same reasoning as this file's other local-getters helpers.
export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "Today" as YYYY-MM-DD, in the local timezone of wherever this runs - client
// (staff's browser) or server (the deploy box, which per CLAUDE.md is set to
// Asia/Jakarta to match the store). NOT `.toISOString().split('T')[0]`, which
// is UTC: during WIB's UTC+7 offset (i.e. every day from local midnight until
// ~07:00), that would silently report YESTERDAY's date - the store's own
// calendar day has already advanced locally, but UTC hasn't caught up yet.
// Same local-getters idiom as useOrderActions.ts's toLocalDateTimeInputValue.
export function getTodayDateString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Default range for every admin date-range filter: first day of the current
// month through today (both inclusive) - e.g. on 2026-07-31 this is
// 2026-07-01..2026-07-31; on 2026-08-03 it's 2026-08-01..2026-08-03.
export function getDefaultDateRange(): { from: string; to: string } {
  const today = getTodayDateString();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
