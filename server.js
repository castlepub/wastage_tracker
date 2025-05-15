// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const seedCosts = require('./scripts/seedCosts');

const app = express();
app.use(cors());
app.use(bodyParser.json());
// Serve static front-end
app.use(express.static(path.join(__dirname, 'public')));

// Validate database URL
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Connect to Postgres with connection timeout
const db = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000
});

// Initialize database and start server
async function initialize() {
  try {
    // 1. Test database connection
    const client = await db.connect();
    console.log('✅ Database connection successful');
    client.release();

    // 2. Ensure tables exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS wastage_entries (
        id SERIAL PRIMARY KEY,
        employee_name TEXT NOT NULL,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        reason TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ wastage_entries table ready');

    // 3. Seed costs data
    await seedCosts(db);
    
    // 4. Start server
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`✅ Server listening on port ${port}`));
  } catch (err) {
    console.error('Initialization failed:', err);
    process.exit(1);
  }
}

// Input validation middleware
const validateWastageEntry = (req, res, next) => {
  const { employeeName, itemName, quantity, unit, reason } = req.body;
  
  if (!employeeName?.trim() || !itemName?.trim() || !quantity || !unit?.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }

  if (typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Quantity must be a positive number'
    });
  }

  next();
};

// POST /api/entry — log a wastage entry
app.post('/api/entry', validateWastageEntry, async (req, res) => {
  const { employeeName, itemName, quantity, unit, reason } = req.body;
  
  try {
    // First check if item exists
    const itemCheck = await db.query(
      'SELECT unit FROM item_costs WHERE item_name = $1',
      [itemName]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid item name'
      });
    }

    // If validation passes, insert the entry
    await db.query(
      `INSERT INTO wastage_entries(employee_name, item_name, quantity, unit, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [employeeName, itemName, quantity, unit, reason || null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error logging wastage:', err);
    res.status(500).json({ success: false, error: 'Failed to log wastage' });
  }
});

// GET /api/items — for autocomplete
app.get('/api/items', async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT item_name AS name, unit AS defaultUnit FROM item_costs ORDER BY item_name'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching items:', err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET /api/entries — wrapped in { entries: [...] }
app.get('/api/entries', async (req, res) => {
  try {
    const { start, end } = req.query;
    console.log('\n=== Entries Request Debug ===');
    console.log('Start date:', start);
    console.log('End date:', end);

    let query = `
      SELECT 
        w.*,
        ic.unit_cost,
        (w.quantity * ic.unit_cost) as total_cost
      FROM wastage_entries w
      LEFT JOIN item_costs ic ON w.item_name = ic.item_name
      WHERE w.timestamp >= $1::timestamptz
      AND w.timestamp < $2::timestamptz
      ORDER BY w.timestamp DESC
    `;
    
    const { rows } = await db.query(query, [start, end]);
    res.json({ entries: rows });
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Health check
app.get('/', (_req, res) => res.send('OK'));

// Initialize the application
initialize().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(async () => {
    console.log('HTTP server closed');
    await db.end();
    console.log('Database connections closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(async () => {
    console.log('HTTP server closed');
    await db.end();
    console.log('Database connections closed');
    process.exit(0);
  });
});
