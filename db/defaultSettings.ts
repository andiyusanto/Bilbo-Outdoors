import { StoreSettings } from '../src/types';

// Shared default store settings, seeded on first run in both JSON-file mode and
// Postgres mode - matches the owner's real weekly schedule (Sun/Mon open at noon,
// every other day 9am, all days close 10pm) and the standard 4-hour late-return
// grace period, until the owner changes them via the admin Settings tab.
export const defaultSettings: StoreSettings = {
  lateToleranceHours: 4,
  operatingHours: {
    monday: { open: '12:00', close: '22:00' },
    tuesday: { open: '09:00', close: '22:00' },
    wednesday: { open: '09:00', close: '22:00' },
    thursday: { open: '09:00', close: '22:00' },
    friday: { open: '09:00', close: '22:00' },
    saturday: { open: '09:00', close: '22:00' },
    sunday: { open: '12:00', close: '22:00' },
  },
};
