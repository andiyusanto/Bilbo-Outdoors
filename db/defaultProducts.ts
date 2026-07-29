import { Product } from '../src/types';

// Shared default catalog, seeded on first run in both JSON-file mode and Postgres
// mode. Pricing matches the owner's 2026 price list (5-day cumulative rate table +
// flat extra-day rate per item - see migrate-pricing-v2.js for the live-DB
// migration of this same data). readinessHours defaults to 0 (immediately
// available after return) for every item until the owner sets real per-item
// values via the admin edit form.
export const defaultProducts: Product[] = [
  // TENT & SHELTER
  { id: 'tent-1', name: 'Compass UL 2P', category: 'TENT & SHELTER', rates: { day1Price: 35000, day2Price: 55000, day3Price: 70000, day4Price: 85000, day5Price: 100000, extraDayRate: 10000 }, readinessHours: 0, stock: 8, description: 'Ultralight 2-person tent, strong and durable.' },
  { id: 'tent-2', name: 'Compass UL 4P', category: 'TENT & SHELTER', rates: { day1Price: 40000, day2Price: 60000, day3Price: 75000, day4Price: 90000, day5Price: 105000, extraDayRate: 10000 }, readinessHours: 0, stock: 6, description: 'Ultralight 4-person tent, spacious.' },
  { id: 'tent-3', name: 'Tendaki Borneo 4P', category: 'TENT & SHELTER', rates: { day1Price: 40000, day2Price: 60000, day3Price: 75000, day4Price: 90000, day5Price: 105000, extraDayRate: 10000 }, readinessHours: 0, stock: 5, description: 'Double layer dome tent, strong wind resistance.' },
  { id: 'tent-4', name: 'Tendaki NSM 6P', category: 'TENT & SHELTER', rates: { day1Price: 45000, day2Price: 65000, day3Price: 80000, day4Price: 95000, day5Price: 110000, extraDayRate: 10000 }, readinessHours: 0, stock: 4, description: 'Large capacity 6-person family camping tent.' },
  { id: 'tent-5', name: 'Monodome 2P', category: 'TENT & SHELTER', rates: { day1Price: 30000, day2Price: 45000, day3Price: 60000, day4Price: 75000, day5Price: 90000, extraDayRate: 5000 }, readinessHours: 0, stock: 6, description: 'Compact single-pole dome tent for 2 people.' },

  // CARRIER & BACKPACK
  { id: 'bag-1', name: 'Tas Lipat Ultralight', category: 'CARRIER & BACKPACK', rates: { day1Price: 18000, day2Price: 25000, day3Price: 30000, day4Price: 35000, day5Price: 40000, extraDayRate: 5000 }, readinessHours: 0, stock: 10, description: 'Packable, lightweight backup bag.' },
  { id: 'bag-2', name: 'Carrier 30L/40L', category: 'CARRIER & BACKPACK', rates: { day1Price: 20000, day2Price: 30000, day3Price: 40000, day4Price: 50000, day5Price: 60000, extraDayRate: 5000 }, readinessHours: 0, stock: 12, description: 'Medium capacity backpack for weekend trips.' },
  { id: 'bag-3', name: 'Daypack Up to 20L', category: 'CARRIER & BACKPACK', rates: { day1Price: 20000, day2Price: 28000, day3Price: 36000, day4Price: 44000, day5Price: 50000, extraDayRate: 5000 }, readinessHours: 0, stock: 15, description: 'Compact daypack for light hiking.' },
  { id: 'bag-4', name: 'Carrier 50L/60L', category: 'CARRIER & BACKPACK', rates: { day1Price: 25000, day2Price: 35000, day3Price: 45000, day4Price: 55000, day5Price: 65000, extraDayRate: 5000 }, readinessHours: 0, stock: 10, description: 'Heavy duty, multi-day capacity hiking backpack.' },
  { id: 'bag-5', name: 'Hydropack Vest', category: 'CARRIER & BACKPACK', rates: { day1Price: 25000, day2Price: 35000, day3Price: 45000, day4Price: 55000, day5Price: 65000, extraDayRate: 5000 }, readinessHours: 0, stock: 8, description: 'Running vest with hydration bladder slot.' },

  // COOKING GEAR
  { id: 'cook-1', name: 'Cooking Set', category: 'COOKING GEAR', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 25000, day5Price: 30000, extraDayRate: 3000 }, readinessHours: 0, stock: 15, description: 'Nesting pots and frying pans.' },
  { id: 'cook-2', name: 'Kompor Outdoor', category: 'COOKING GEAR', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 25000, day5Price: 30000, extraDayRate: 3000 }, readinessHours: 0, stock: 15, description: 'Portable folding gas stove.' },
  { id: 'cook-3', name: 'Grill Pan', category: 'COOKING GEAR', rates: { day1Price: 15000, day2Price: 23000, day3Price: 30000, day4Price: 35000, day5Price: 40000, extraDayRate: 3000 }, readinessHours: 0, stock: 10, description: 'Non-stick outdoor barbecue grill pan.' },
  { id: 'cook-4', name: 'Kompor Grill', category: 'COOKING GEAR', rates: { day1Price: 25000, day2Price: 35000, day3Price: 45000, day4Price: 55000, day5Price: 65000, extraDayRate: 5000 }, readinessHours: 0, stock: 8, description: 'Dedicated portable barbecue stove.' },

  // LIGHTING & POWER
  { id: 'light-1', name: 'Headlamp (inc baterai)', category: 'LIGHTING & POWER', rates: { day1Price: 6000, day2Price: 10000, day3Price: 13000, day4Price: 15000, day5Price: 17000, extraDayRate: 2000 }, readinessHours: 0, stock: 20, description: 'Hands-free outdoor LED headlamp, batteries included.' },
  { id: 'light-2', name: 'Lampu Tenda (inc baterai)', category: 'LIGHTING & POWER', rates: { day1Price: 6000, day2Price: 10000, day3Price: 13000, day4Price: 15000, day5Price: 17000, extraDayRate: 2000 }, readinessHours: 0, stock: 15, description: 'Hanging tent lantern with replaceable batteries.' },
  { id: 'light-3', name: 'Lampu Tenda (charge)', category: 'LIGHTING & POWER', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 23000, day5Price: 25000, extraDayRate: 2000 }, readinessHours: 0, stock: 15, description: 'Rechargeable LED tent lantern.' },
  { id: 'light-4', name: 'Senter Tactical', category: 'LIGHTING & POWER', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 23000, day5Price: 25000, extraDayRate: 2000 }, readinessHours: 0, stock: 12, description: 'High lumen focusable tactical flashlight.' },
  { id: 'light-6', name: 'Senter Tactical + 18650', category: 'LIGHTING & POWER', rates: { day1Price: 15000, day2Price: 20000, day3Price: 25000, day4Price: 28000, day5Price: 30000, extraDayRate: 2000 }, readinessHours: 0, stock: 8, description: 'Tactical flashlight bundled with a rechargeable 18650 battery.' },
  { id: 'light-5', name: 'Powerbank 10.000mAh', category: 'LIGHTING & POWER', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 23000, day5Price: 25000, extraDayRate: 2000 }, readinessHours: 0, stock: 10, description: 'Rugged outdoor power bank.' },
  { id: 'light-7', name: 'Powerbank 20.000mAh', category: 'LIGHTING & POWER', rates: { day1Price: 15000, day2Price: 20000, day3Price: 25000, day4Price: 28000, day5Price: 30000, extraDayRate: 2000 }, readinessHours: 0, stock: 8, description: 'Higher-capacity rugged outdoor power bank.' },

  // SLEEPING SYSTEM
  { id: 'sleep-1', name: 'Matras karet Single', category: 'SLEEPING SYSTEM', rates: { day1Price: 5000, day2Price: 8000, day3Price: 10000, day4Price: 12000, day5Price: 14000, extraDayRate: 1000 }, readinessHours: 0, stock: 20, description: 'Standard rubber roll-up mat.' },
  { id: 'sleep-2', name: 'Matras Foil UL Double', category: 'SLEEPING SYSTEM', rates: { day1Price: 8000, day2Price: 13000, day3Price: 15000, day4Price: 18000, day5Price: 20000, extraDayRate: 1000 }, readinessHours: 0, stock: 15, description: 'Double-sized aluminum foil insulated mat.' },
  { id: 'sleep-3', name: 'Sleeping Bag Polar', category: 'SLEEPING SYSTEM', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 23000, day5Price: 25000, extraDayRate: 2000 }, readinessHours: 0, stock: 15, description: 'Warm polar fleece lining sleeping bag.' },
  { id: 'sleep-4', name: 'Sleeping Bag Dakron', category: 'SLEEPING SYSTEM', rates: { day1Price: 20000, day2Price: 30000, day3Price: 35000, day4Price: 40000, day5Price: 45000, extraDayRate: 3000 }, readinessHours: 0, stock: 10, description: 'Thick dacron insulated sleeping bag for cold weather.' },

  // APPAREL & PERSONAL GEAR
  { id: 'apparel-1', name: 'Jaket Puffer Dewasa', category: 'APPAREL & PERSONAL GEAR', rates: { day1Price: 25000, day2Price: 35000, day3Price: 40000, day4Price: 45000, day5Price: 50000, extraDayRate: 3000 }, readinessHours: 0, stock: 10, description: 'Insulated adult puffer jacket for cold-weather trips.' },
  { id: 'apparel-2', name: 'Jaket Gorpcore Dewasa', category: 'APPAREL & PERSONAL GEAR', rates: { day1Price: 25000, day2Price: 35000, day3Price: 40000, day4Price: 45000, day5Price: 50000, extraDayRate: 3000 }, readinessHours: 0, stock: 10, description: 'Adult technical outdoor jacket, gorpcore style.' },
  { id: 'apparel-3', name: 'Jaket Running / Windbreaker', category: 'APPAREL & PERSONAL GEAR', rates: { day1Price: 20000, day2Price: 30000, day3Price: 35000, day4Price: 40000, day5Price: 45000, extraDayRate: 3000 }, readinessHours: 0, stock: 10, description: 'Lightweight windbreaker/running jacket.' },
  { id: 'apparel-4', name: 'Jaket Puffer Anak', category: 'APPAREL & PERSONAL GEAR', rates: { day1Price: 20000, day2Price: 30000, day3Price: 35000, day4Price: 40000, day5Price: 45000, extraDayRate: 3000 }, readinessHours: 0, stock: 8, description: 'Insulated puffer jacket sized for children.' },
  { id: 'apparel-5', name: 'Sarung Tangan Double Polar', category: 'APPAREL & PERSONAL GEAR', rates: { day1Price: 12000, day2Price: 15000, day3Price: 18000, day4Price: 20000, day5Price: 22000, extraDayRate: 2000 }, readinessHours: 0, stock: 15, description: 'Double-layer polar fleece gloves.' },
  { id: 'hike-3', name: 'Geiter', category: 'APPAREL & PERSONAL GEAR', rates: { day1Price: 12000, day2Price: 15000, day3Price: 18000, day4Price: 20000, day5Price: 22000, extraDayRate: 2000 }, readinessHours: 0, stock: 10, description: 'Protective leg gaiters against mud and dirt.' },

  // HIKING ESSENTIALS
  { id: 'hike-1', name: 'Sepatu Hiking / Trail Run', category: 'HIKING ESSENTIALS', rates: { day1Price: 25000, day2Price: 35000, day3Price: 45000, day4Price: 55000, day5Price: 65000, extraDayRate: 5000 }, readinessHours: 0, stock: 10, description: 'High traction, waterproof hiking/trail running shoes.' },
  { id: 'hike-2', name: 'Trekking Pole', category: 'HIKING ESSENTIALS', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 23000, day5Price: 25000, extraDayRate: 2000 }, readinessHours: 0, stock: 15, description: 'Adjustable aluminum hiking stick.' },

  // CAMP SUPPORT
  { id: 'support-1', name: 'Fly Sheet', category: 'CAMP SUPPORT', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 23000, day5Price: 25000, extraDayRate: 2000 }, readinessHours: 0, stock: 15, description: 'Waterproof tarp shelter (3x4m).' },
  { id: 'support-2', name: 'Tiang Flysheet', category: 'CAMP SUPPORT', rates: { day1Price: 10000, day2Price: 15000, day3Price: 20000, day4Price: 23000, day5Price: 25000, extraDayRate: 2000 }, readinessHours: 0, stock: 10, description: 'Set of folding poles for flysheets.' },
  { id: 'support-3', name: 'Hammock', category: 'CAMP SUPPORT', rates: { day1Price: 8000, day2Price: 13000, day3Price: 15000, day4Price: 18000, day5Price: 20000, extraDayRate: 1000 }, readinessHours: 0, stock: 12, description: 'Heavy duty hanging hammock.' },
  { id: 'support-4', name: 'Kursi Lipat', category: 'CAMP SUPPORT', rates: { day1Price: 15000, day2Price: 20000, day3Price: 25000, day4Price: 28000, day5Price: 30000, extraDayRate: 2000 }, readinessHours: 0, stock: 20, description: 'Compact outdoor folding chair.' },
  { id: 'support-5', name: 'Meja Lipat', category: 'CAMP SUPPORT', rates: { day1Price: 15000, day2Price: 20000, day3Price: 25000, day4Price: 28000, day5Price: 30000, extraDayRate: 2000 }, readinessHours: 0, stock: 12, description: 'Folding lightweight camping table.' },
  // Not part of the owner's 2026 price list - kept in the catalog with a price
  // table inferred from its old flat rate matching Kursi Lipat/Meja Lipat exactly
  // (see migrate-pricing-v2.js). Adjust via the admin edit form if this guess is wrong.
  { id: 'support-6', name: 'Pasak Alloy 10 Pcs', category: 'CAMP SUPPORT', rates: { day1Price: 15000, day2Price: 20000, day3Price: 25000, day4Price: 28000, day5Price: 30000, extraDayRate: 2000 }, readinessHours: 0, stock: 25, description: 'Strong, lightweight aluminum alloy tent stakes.' }
];
