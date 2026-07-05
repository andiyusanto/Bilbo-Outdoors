import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Product, Order, OrderStatus, DashboardStats } from './src/types';

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'server_db.json');

// Middleware
app.use(express.json({ limit: '10mb' }));

// Helper: Ensure database file exists with initial seeded data
function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultProducts: Product[] = [
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

    const dbData = {
      products: defaultProducts,
      orders: [] as Order[]
    };

    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
    console.log('Database seeded successfully at', DB_FILE);
  }
}

initDatabase();

// Database Reading / Writing helpers
function readDB() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database file, re-initializing...', error);
    initDatabase();
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  }
}

function writeDB(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Auth Helper Middleware
function authenticateAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token === 'bilbo-outdoors-admin-token-2026') {
      return next();
    }
  }
  res.status(401).json({ error: 'Unauthorized. Admin credentials required.' });
}

// ---------------- API ENDPOINTS ----------------

// Staff Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'bilbooutdoor2026') {
    res.json({ token: 'bilbo-outdoors-admin-token-2026', username: 'Admin Staff' });
  } else {
    res.status(401).json({ error: 'Invalid username or password. Use: admin / bilbooutdoor2026' });
  }
});

// Get Products (available to both clients and admins)
app.get('/api/products', (req, res) => {
  const db = readDB();
  res.json(db.products);
});

// Admin CRUD: Create Product
app.post('/api/products', authenticateAdmin, (req, res) => {
  const { name, category, price, incrementalPriceAfter5Days, stock, description, image } = req.body;
  if (!name || !category || price === undefined || stock === undefined) {
    return res.status(400).json({ error: 'Missing required product fields.' });
  }

  const db = readDB();
  const newProduct: Product = {
    id: `product-${Date.now()}`,
    name,
    category,
    price: Number(price),
    incrementalPriceAfter5Days: Number(incrementalPriceAfter5Days || 0),
    stock: Number(stock),
    description: description || '',
    image: image || ''
  };

  db.products.push(newProduct);
  writeDB(db);
  res.status(201).json(newProduct);
});

// Admin CRUD: Update Product
app.put('/api/products/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { name, category, price, incrementalPriceAfter5Days, stock, description, image } = req.body;

  const db = readDB();
  const productIndex = db.products.findIndex((p: Product) => p.id === id);
  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  db.products[productIndex] = {
    ...db.products[productIndex],
    name: name !== undefined ? name : db.products[productIndex].name,
    category: category !== undefined ? category : db.products[productIndex].category,
    price: price !== undefined ? Number(price) : db.products[productIndex].price,
    incrementalPriceAfter5Days: incrementalPriceAfter5Days !== undefined ? Number(incrementalPriceAfter5Days) : db.products[productIndex].incrementalPriceAfter5Days,
    stock: stock !== undefined ? Number(stock) : db.products[productIndex].stock,
    description: description !== undefined ? description : db.products[productIndex].description,
    image: image !== undefined ? image : db.products[productIndex].image
  };

  writeDB(db);
  res.json(db.products[productIndex]);
});

// Admin CRUD: Delete Product
app.delete('/api/products/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const initialCount = db.products.length;
  db.products = db.products.filter((p: Product) => p.id !== id);

  if (db.products.length === initialCount) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  writeDB(db);
  res.json({ message: 'Product deleted successfully.' });
});

// Helper function to calculate overlapping stock usage for products
// Returns a map of productId -> maxAllocated quantity during the period
function calculateAllocatedStock(orders: Order[], startDateStr: string, endDateStr: string): Record<string, number> {
  const startReq = new Date(startDateStr);
  const endReq = new Date(endDateStr);

  const allocationMap: Record<string, number> = {};

  // For each overlapping order that is NOT completed/returned
  const activeOrders = orders.filter(o => o.status !== 'Item Returned/Completed');

  // Let's iterate through each day of the requested range
  const tempDate = new Date(startReq);
  while (tempDate <= endReq) {
    const dayStr = tempDate.toISOString().split('T')[0];

    // For this specific day, sum up allocations for all active overlapping orders
    const dailyAllocation: Record<string, number> = {};

    activeOrders.forEach(order => {
      const orderStart = new Date(order.startDate);
      const orderEnd = new Date(order.endDate);
      const currentDay = new Date(dayStr);

      if (currentDay >= orderStart && currentDay <= orderEnd) {
        order.items.forEach(item => {
          dailyAllocation[item.productId] = (dailyAllocation[item.productId] || 0) + item.quantity;
        });
      }
    });

    // Update the maximum allocation found on any single day within the range
    Object.keys(dailyAllocation).forEach(pId => {
      allocationMap[pId] = Math.max(allocationMap[pId] || 0, dailyAllocation[pId]);
    });

    tempDate.setDate(tempDate.getDate() + 1);
  }

  return allocationMap;
}

// Check Availability (Available to clients and admins)
app.post('/api/check-availability', (req, res) => {
  const { startDate, endDate, items } = req.body; // items is optional array of { productId, quantity }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing start date or end date.' });
  }

  const db = readDB();
  const allocatedMap = calculateAllocatedStock(db.orders, startDate, endDate);

  const availabilityDetails = db.products.map((prod: Product) => {
    const allocated = allocatedMap[prod.id] || 0;
    const remaining = Math.max(0, prod.stock - allocated);
    
    // If the request checked a specific quantity
    const requestedItem = items?.find((it: any) => it.productId === prod.id);
    const requestedQty = requestedItem ? Number(requestedItem.quantity) : 0;
    const isAvailable = remaining >= requestedQty;

    return {
      productId: prod.id,
      name: prod.name,
      category: prod.category,
      totalStock: prod.stock,
      allocated,
      remaining,
      requestedQty,
      isAvailable
    };
  });

  const overallAvailable = availabilityDetails.every((item: any) => item.requestedQty === 0 || item.isAvailable);

  res.json({
    available: overallAvailable,
    details: availabilityDetails
  });
});

// Submit Order (Clients)
app.post('/api/orders', (req, res) => {
  const { customerName, customerWhatsApp, startDate, endDate, items, idCardBase64 } = req.body;

  if (!customerName || !customerWhatsApp || !startDate || !endDate || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required order fields.' });
  }

  const db = readDB();

  // 1. Re-verify stock availability server-side to guarantee integrity
  const allocatedMap = calculateAllocatedStock(db.orders, startDate, endDate);
  
  for (const item of items) {
    const product = db.products.find((p: Product) => p.id === item.productId);
    if (!product) {
      return res.status(400).json({ error: `Product with ID ${item.productId} not found.` });
    }
    const allocated = allocatedMap[product.id] || 0;
    const remaining = product.stock - allocated;
    if (item.quantity > remaining) {
      return res.status(400).json({ 
        error: `Maaf, stok item "${product.name}" tidak mencukupi untuk tanggal tersebut. Tersisa: ${remaining} unit, diminta: ${item.quantity} unit.` 
      });
    }
  }

  // 2. Calculate Rent Duration
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const rentDuration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive rent days

  // 3. Calculate Item Costs and Total Price
  let totalPrice = 0;
  const orderItems = items.map((it: any) => {
    const prod = db.products.find((p: Product) => p.id === it.productId)!;
    
    // Formula: First 5 days cost standard price. Days after 5 cost base_price + incrementalPriceAfter5Days.
    let itemTotal = 0;
    for (let day = 1; day <= rentDuration; day++) {
      if (day > 5) {
        itemTotal += (prod.price + prod.incrementalPriceAfter5Days);
      } else {
        itemTotal += prod.price;
      }
    }
    const itemCost = itemTotal * it.quantity;
    totalPrice += itemCost;

    return {
      productId: prod.id,
      productName: prod.name,
      quantity: Number(it.quantity),
      pricePerDay: prod.price,
      incrementalPrice: prod.incrementalPriceAfter5Days
    };
  });

  // 4. Create Order Object
  const newOrder: Order = {
    id: `order-${Date.now()}`,
    customerName,
    customerWhatsApp,
    startDate,
    endDate,
    rentDuration,
    items: orderItems,
    totalPrice,
    idCardBase64: idCardBase64 || '',
    status: 'Pending',
    createdAt: new Date().toISOString()
  };

  db.orders.unshift(newOrder); // Add to beginning
  writeDB(db);

  res.status(201).json(newOrder);
});

// Admin: Get all orders
app.get('/api/orders', authenticateAdmin, (req, res) => {
  const db = readDB();
  res.json(db.orders);
});

// Admin: Update order status
app.put('/api/orders/:id/status', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses: OrderStatus[] = ['Pending', 'Approved/Paid', 'Item Picked Up', 'Item Returned/Completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status.' });
  }

  const db = readDB();
  const orderIndex = db.orders.findIndex((o: Order) => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  db.orders[orderIndex].status = status;
  writeDB(db);
  res.json(db.orders[orderIndex]);
});

// Admin: Calculate late returns and penalty fees
app.post('/api/orders/:id/calculate-late', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { returnDate } = req.body; // YYYY-MM-DD (defaults to today if not provided)

  const db = readDB();
  const order = db.orders.find((o: Order) => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  // Use provided return date, or default to current date in Surabaya (local server time)
  const actualReturnDateStr = returnDate || new Date().toISOString().split('T')[0];
  const actualReturn = new Date(actualReturnDateStr);
  const scheduledEnd = new Date(order.endDate);

  // Calculate late days
  const diffTime = actualReturn.getTime() - scheduledEnd.getTime();
  const lateDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  if (lateDays === 0) {
    return res.json({
      lateDays: 0,
      lateFee: 0,
      breakdown: []
    });
  }

  // Calculate late fee per item
  let lateFeeTotal = 0;
  const breakdown = order.items.map(item => {
    // For each late day:
    // If the original rentDuration was D, late day i is D + dayIndex.
    // Tents: incremental pricing of +10k if dayIndex + D > 5.
    let itemLateCost = 0;
    const basePrice = item.pricePerDay;
    const incremental = item.incrementalPrice;

    for (let dayIndex = 1; dayIndex <= lateDays; dayIndex++) {
      const daySeqNum = order.rentDuration + dayIndex;
      const dailyPrice = daySeqNum > 5 ? (basePrice + incremental) : basePrice;
      itemLateCost += dailyPrice;
    }

    const itemTotalLateCost = itemLateCost * item.quantity;
    lateFeeTotal += itemTotalLateCost;

    return {
      productName: item.productName,
      quantity: item.quantity,
      dailyRateBreakdown: item.incrementalPrice > 0 ? `Base: ${basePrice} (+${incremental} after 5d)` : `Rate: ${basePrice}`,
      itemTotalLateCost
    };
  });

  // Save the late fees back to order
  order.lateDays = lateDays;
  order.lateFee = lateFeeTotal;
  
  // Note: We don't save DB immediately, user can confirm returning, then status updates and saves, 
  // but let's save these calculated values now so they stick to the order.
  const orderIndex = db.orders.findIndex((o: Order) => o.id === id);
  db.orders[orderIndex] = order;
  writeDB(db);

  res.json({
    lateDays,
    lateFee: lateFeeTotal,
    breakdown,
    actualReturnDate: actualReturnDateStr
  });
});

// Admin: Get Dashboard Stats
app.get('/api/stats', authenticateAdmin, (req, res) => {
  const db = readDB();
  const orders: Order[] = db.orders;

  const todayStr = new Date().toISOString().split('T')[0];

  // Active rentals = orders that have been approved or items picked up
  const activeRentalsCount = orders.filter(o => o.status === 'Approved/Paid' || o.status === 'Item Picked Up').length;

  // Total Revenue = Sum of totalPrice of all Approved, Picked Up, and Completed orders, plus any late fees
  const finishedOrPaidOrders = orders.filter(o => o.status !== 'Pending');
  const totalRevenue = finishedOrPaidOrders.reduce((sum, o) => {
    return sum + o.totalPrice + (o.lateFee || 0);
  }, 0);

  // Items due for return today = Active orders with EndDate === todayStr or before today and not completed
  const dueTodayCount = orders.filter(o => {
    return (o.status === 'Item Picked Up' || o.status === 'Approved/Paid') && (o.endDate <= todayStr);
  }).length;

  res.json({
    activeRentalsCount,
    totalRevenue,
    dueTodayCount
  });
});

// ---------------- VITE FRONTEND INTERPRETATION ----------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // In development mode, Vite compiles frontend code on the fly
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // In production mode, serve compiled static files from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bilbo Outdoors Server running at http://localhost:${PORT}`);
  });
}

startServer();
