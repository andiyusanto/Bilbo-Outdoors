import { Product } from '../src/types';

// Shared default catalog, seeded on first run in both JSON-file mode and Postgres mode.
export const defaultProducts: Product[] = [
  // TENT & SHELTER (All have +10k after 5 days)
  { id: 'tent-1', name: 'Compass UL 2P', category: 'TENT & SHELTER', price: 35000, incrementalPriceAfter5Days: 10000, stock: 8, description: 'Ultralight 2-person tent, strong and durable.' },
  { id: 'tent-2', name: 'Compass UL 4P', category: 'TENT & SHELTER', price: 40000, incrementalPriceAfter5Days: 10000, stock: 6, description: 'Ultralight 4-person tent, spacious.' },
  { id: 'tent-3', name: 'Tendaki Borneo 4P', category: 'TENT & SHELTER', price: 40000, incrementalPriceAfter5Days: 10000, stock: 5, description: 'Double layer dome tent, strong wind resistance.' },
  { id: 'tent-4', name: 'Tendaki NSM 6P', category: 'TENT & SHELTER', price: 45000, incrementalPriceAfter5Days: 10000, stock: 4, description: 'Large capacity 6-person family camping tent.' },

  // SLEEPING SYSTEM
  { id: 'sleep-1', name: 'Matras Karet Single', category: 'SLEEPING SYSTEM', price: 5000, incrementalPriceAfter5Days: 0, stock: 20, description: 'Standard rubber roll-up mat.' },
  { id: 'sleep-2', name: 'Matras Foil UL Double', category: 'SLEEPING SYSTEM', price: 8000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Double-sized aluminum foil insulated mat.' },
  { id: 'sleep-3', name: 'Sleeping Bag Polar', category: 'SLEEPING SYSTEM', price: 10000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Warm polar fleece lining sleeping bag.' },
  { id: 'sleep-4', name: 'Sleeping Bag Dakron', category: 'SLEEPING SYSTEM', price: 20000, incrementalPriceAfter5Days: 0, stock: 10, description: 'Thick dacron insulated sleeping bag for cold weather.' },

  // CARRIER & BACKPACK
  { id: 'bag-1', name: 'Tas Lipat Ultralight', category: 'CARRIER & BACKPACK', price: 18000, incrementalPriceAfter5Days: 0, stock: 10, description: 'Packable, lightweight backup bag.' },
  { id: 'bag-2', name: 'Carrier 30L/40L', category: 'CARRIER & BACKPACK', price: 20000, incrementalPriceAfter5Days: 0, stock: 12, description: 'Medium capacity backpack for weekend trips.' },
  { id: 'bag-3', name: 'Daypack up to 20L', category: 'CARRIER & BACKPACK', price: 20000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Compact daypack for light hiking.' },
  { id: 'bag-4', name: 'Carrier 50L/60L', category: 'CARRIER & BACKPACK', price: 25000, incrementalPriceAfter5Days: 0, stock: 10, description: 'Heavy duty, multi-day capacity hiking backpack.' },
  { id: 'bag-5', name: 'Hydropack Vest', category: 'CARRIER & BACKPACK', price: 25000, incrementalPriceAfter5Days: 0, stock: 8, description: 'Running vest with hydration bladder slot.' },

  // COOKING GEAR
  { id: 'cook-1', name: 'Cooking Set', category: 'COOKING GEAR', price: 10000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Nesting pots and frying pans.' },
  { id: 'cook-2', name: 'Kompor Outdoor', category: 'COOKING GEAR', price: 10000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Portable folding gas stove.' },
  { id: 'cook-3', name: 'Grill Pan', category: 'COOKING GEAR', price: 15000, incrementalPriceAfter5Days: 0, stock: 10, description: 'Non-stick outdoor barbecue grill pan.' },
  { id: 'cook-4', name: 'Kompor Grill', category: 'COOKING GEAR', price: 25000, incrementalPriceAfter5Days: 0, stock: 8, description: 'Dedicated portable barbecue stove.' },

  // LIGHTING & POWER
  { id: 'light-1', name: 'Headlamp', category: 'LIGHTING & POWER', price: 6000, incrementalPriceAfter5Days: 0, stock: 20, description: 'Hands-free outdoor LED headlamp.' },
  { id: 'light-2', name: 'Lampu Tenda inc baterai', category: 'LIGHTING & POWER', price: 6000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Hanging tent lantern with replaceable batteries.' },
  { id: 'light-3', name: 'Lampu Tenda charge', category: 'LIGHTING & POWER', price: 10000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Rechargeable LED tent lantern.' },
  { id: 'light-4', name: 'Senter Tactical', category: 'LIGHTING & POWER', price: 10000, incrementalPriceAfter5Days: 0, stock: 12, description: 'High lumen focusable tactical flashlight.' },
  { id: 'light-5', name: 'Powerbank 10.000mAh', category: 'LIGHTING & POWER', price: 10000, incrementalPriceAfter5Days: 0, stock: 10, description: 'Rugged outdoor power bank.' },

  // HIKING ESSENTIALS
  { id: 'hike-1', name: 'Sepatu Hiking', category: 'HIKING ESSENTIALS', price: 25000, incrementalPriceAfter5Days: 0, stock: 10, description: 'High traction, waterproof hiking shoes.' },
  { id: 'hike-2', name: 'Trekking Pole', category: 'HIKING ESSENTIALS', price: 10000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Adjustable aluminum hiking stick.' },
  { id: 'hike-3', name: 'Geiter', category: 'HIKING ESSENTIALS', price: 12000, incrementalPriceAfter5Days: 0, stock: 10, description: 'Protective leg gaiters against mud and dirt.' },

  // CAMP SUPPORT
  { id: 'support-1', name: 'Fly Sheet', category: 'CAMP SUPPORT', price: 10000, incrementalPriceAfter5Days: 0, stock: 15, description: 'Waterproof tarp shelter (3x4m).' },
  { id: 'support-2', name: 'Tiang Flysheet Set', category: 'CAMP SUPPORT', price: 10000, incrementalPriceAfter5Days: 0, stock: 10, description: 'Set of folding poles for flysheets.' },
  { id: 'support-3', name: 'Hammock', category: 'CAMP SUPPORT', price: 8000, incrementalPriceAfter5Days: 0, stock: 12, description: 'Heavy duty hanging hammock.' },
  { id: 'support-4', name: 'Kursi Lipat', category: 'CAMP SUPPORT', price: 15000, incrementalPriceAfter5Days: 0, stock: 20, description: 'Compact outdoor folding chair.' },
  { id: 'support-5', name: 'Meja Lipat', category: 'CAMP SUPPORT', price: 15000, incrementalPriceAfter5Days: 0, stock: 12, description: 'Folding lightweight camping table.' },
  { id: 'support-6', name: 'Pasak Alloy 10 Pcs', category: 'CAMP SUPPORT', price: 15000, incrementalPriceAfter5Days: 0, stock: 25, description: 'Strong, lightweight aluminum alloy tent stakes.' }
];
