import { JobPriceListItem } from '../src/types';

// Shared default job price list, seeded on first run in both JSON-file mode
// and Postgres mode - transcribed directly from the owner's "master" sheet
// ("data pekerjaan" table). Items with no cleaning price simply don't offer
// CLEANING as a job type on the Operational form (most non-tent gear is only
// ever laundered or inventory-checked, never "cleaned" as a separate service).
export const defaultJobPriceList: JobPriceListItem[] = [
  { id: 'job-price-1', itemName: 'Tenda Kap 2-3 Single Layer', cleaningPrice: 5000, laundryPrice: 10000, inventarisPrice: 10000 },
  { id: 'job-price-2', itemName: 'Tenda Kap 2-3 Double Layer', cleaningPrice: 5000, laundryPrice: 10000, inventarisPrice: 10000 },
  { id: 'job-price-3', itemName: 'Tenda Kap 4-5 Single Layer', cleaningPrice: 5000, laundryPrice: 10000, inventarisPrice: 10000 },
  { id: 'job-price-4', itemName: 'Tenda Kap 4-5 Double Layer', cleaningPrice: 5000, laundryPrice: 15000, inventarisPrice: 10000 },
  { id: 'job-price-5', itemName: 'Tenda Kap 6-8 Single Layer', cleaningPrice: 10000, laundryPrice: 20000, inventarisPrice: 15000 },
  { id: 'job-price-6', itemName: 'Tenda Kap 6-8 Double Layer', cleaningPrice: 10000, laundryPrice: 25000, inventarisPrice: 15000 },
  { id: 'job-price-7', itemName: 'Carrier inc Rain cover', laundryPrice: 10000, inventarisPrice: 5000 },
  { id: 'job-price-8', itemName: 'Daypack 10liter', laundryPrice: 7000, inventarisPrice: 5000 },
  { id: 'job-price-9', itemName: 'Daypack 28liter', laundryPrice: 8000, inventarisPrice: 5000 },
  { id: 'job-price-10', itemName: 'Waist bag / sling Bag', laundryPrice: 5000, inventarisPrice: 3000 },
  { id: 'job-price-11', itemName: 'Tas Lipat, hydropack. Vest Running', laundryPrice: 5000, inventarisPrice: 3000 },
  { id: 'job-price-12', itemName: 'Sepatu Trekking', laundryPrice: 10000, inventarisPrice: 5000 },
  { id: 'job-price-13', itemName: 'Flysheet 2x2 meter, 3x2 meter, 3x4 meter', laundryPrice: 10000, inventarisPrice: 6000 },
  { id: 'job-price-14', itemName: 'Flysheet 6x4meter', laundryPrice: 15000, inventarisPrice: 8000 },
  { id: 'job-price-15', itemName: 'Sleeping Bag Polar', laundryPrice: 5000, inventarisPrice: 5000 },
  { id: 'job-price-16', itemName: 'Sleeping Bag Dakron', laundryPrice: 10000, inventarisPrice: 5000 },
  { id: 'job-price-17', itemName: 'Sleeping Bag Bulang', laundryPrice: 10000, inventarisPrice: 5000 },
  { id: 'job-price-18', itemName: 'matras karet single', laundryPrice: 2000, inventarisPrice: 2000 },
  { id: 'job-price-19', itemName: 'jaket Polar', laundryPrice: 10000, inventarisPrice: 5000 },
  { id: 'job-price-20', itemName: 'Jaket Puffer/Gorpcore/running', laundryPrice: 10000, inventarisPrice: 5000 },
];
