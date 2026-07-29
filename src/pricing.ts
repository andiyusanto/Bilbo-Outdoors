import { DayRateTable } from './types';

// Total cost to rent one unit for `days` days, under the new cumulative-table model.
export function calculateRentalCost(rates: DayRateTable, days: number): number {
  if (days <= 0) return 0;
  if (days <= 5) {
    return [rates.day1Price, rates.day2Price, rates.day3Price, rates.day4Price, rates.day5Price][days - 1];
  }
  return rates.day5Price + (days - 5) * rates.extraDayRate;
}

// Same shape, for OrderItems snapshotted before the pricing-schema migration under
// the old flat-rate-minus-discount-after-threshold model. Kept only so historical
// orders' late fees still compute correctly - delete once no pre-migration order
// can still be open.
export function calculateLegacyRentalCost(
  pricePerDay: number,
  incrementalPrice: number,
  discountThresholdDays: number,
  days: number
): number {
  if (days <= 0) return 0;
  let total = 0;
  for (let day = 1; day <= days; day++) {
    total += day > discountThresholdDays ? (pricePerDay - incrementalPrice) : pricePerDay;
  }
  return total;
}

// How much a continuous 5-day rental saves vs. paying day1's rate five times over.
// Replaces the old scalar incrementalPriceAfter5Days as the "is this discounted"
// signal, since the new table has no single per-day discount amount to report.
// Clamped to 0 so a mistyped (non-monotonic) rate table can't read as "discounted".
export function calculateSavingsFor5Days(rates: DayRateTable): number {
  return Math.max(0, rates.day1Price * 5 - rates.day5Price);
}
