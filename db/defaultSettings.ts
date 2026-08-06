import { StoreSettings } from '../src/types';

// Shared default store settings, seeded on first run in both JSON-file mode and
// Postgres mode - matches the owner's real weekly schedule (Sun/Mon open at noon,
// every other day 9am, all days close 10pm), the standard 4-hour late-return
// grace period, and the public site's original hardcoded footer/marquee text
// (so seeding this doesn't change anything visually), until the owner edits
// any of it via the admin Pengaturan tab.
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
  footer: {
    description: 'Penyedia sewa alat kemah, trekking, dan hiking terlengkap dan tepercaya di kota Surabaya. Kami memastikan petualangan Anda aman dengan alat berkualitas terbaik.',
    address: 'Jl. Ngagel Jaya Tengah No. 12, Pucang Sewu, Kec. Gubeng, Kota Surabaya, Jawa Timur 60283',
    instagramHandle: '@bilbooutdoors (INSTAGRAM)',
    instagramUrl: 'https://instagram.com/bilbooutdoors',
    whatsappText: 'Narahubung Cepat WA: 0811-370-6666',
    copyrightText: '© 2026 Bilbo Outdoors Surabaya. All rights reserved. Hubungi kami untuk petualangan seru Anda!',
  },
  runningText: [
    'Tent & Shelter',
    'Sleeping Systems',
    'Carrier & Backpack',
    'Cooking Gear',
    'Lighting & Power',
    'Hiking Essentials',
    'Camp Support',
    'Apparel & Personal Gear',
  ],
};
