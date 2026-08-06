import { WeeklyHours, DayHours } from '../types';

const DAY_ORDER: { key: keyof WeeklyHours; label: string }[] = [
  { key: 'monday', label: 'Senin' },
  { key: 'tuesday', label: 'Selasa' },
  { key: 'wednesday', label: 'Rabu' },
  { key: 'thursday', label: 'Kamis' },
  { key: 'friday', label: 'Jumat' },
  { key: 'saturday', label: 'Sabtu' },
  { key: 'sunday', label: 'Minggu' },
];

const sameHours = (a: DayHours, b: DayHours) => a.open === b.open && a.close === b.close;

// Groups consecutive days (Senin -> Minggu) that share identical open/close
// times into one line each, e.g. a uniform week collapses to a single line,
// while a schedule like the real one (Mon/Sun open at noon, Tue-Sat at 9am)
// produces 3 short lines instead of a misleading single flat range.
export function summarizeOperatingHours(hours: WeeklyHours): string[] {
  const lines: string[] = [];
  let groupStart = 0;

  for (let i = 1; i <= DAY_ORDER.length; i++) {
    const prevHours = hours[DAY_ORDER[i - 1].key];
    const currHours = i < DAY_ORDER.length ? hours[DAY_ORDER[i].key] : null;
    if (currHours && sameHours(prevHours, currHours)) continue;

    const startLabel = DAY_ORDER[groupStart].label;
    const endLabel = DAY_ORDER[i - 1].label;
    const dayLabel = groupStart === i - 1 ? startLabel : `${startLabel}-${endLabel}`;
    lines.push(`${dayLabel.toUpperCase()}: ${prevHours.open} - ${prevHours.close} WIB`);
    groupStart = i;
  }

  return lines;
}
