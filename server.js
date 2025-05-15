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
    `;

    const params = [];
    
    // Only add WHERE clause if both start and end dates are provided
    if (start && end) {
      query += `
        WHERE w.timestamp >= $1::timestamptz
        AND w.timestamp < $2::timestamptz
      `;
      params.push(start, end);
    }

    // Always order by timestamp
    query += ` ORDER BY w.timestamp DESC`;
    
    const { rows } = await db.query(query, params);
    res.json({ entries: rows });
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const client = await db.connect();
    client.release();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

// Health check
app.get('/', (_req, res) => res.send('OK'));

// Add error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Don't exit the process, just log the error
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  db.end(() => {
    console.log('Database connection closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  db.end(() => {
    console.log('Database connection closed.');
    process.exit(0);
  });
});

// Add export endpoint with token auth
app.get('/api/export-entries', async (req, res) => {
  console.log('Export endpoint called');
  
  const token = req.headers.authorization?.split(' ')[1];
  console.log('Received token:', token ? '(present)' : '(missing)');
  
  if (!token || token !== process.env.EXPORT_TOKEN) {
    console.log('Invalid or missing token');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Fetching entries from database...');
    const entries = await db.query(
      'SELECT * FROM wastage_entries ORDER BY timestamp DESC'
    );
    
    console.log(`Found ${entries.rows.length} entries`);
    
    // Ensure we're sending a valid JSON array
    const sanitizedEntries = entries.rows.map(entry => ({
      id: entry.id,
      employee_name: entry.employee_name,
      item_name: entry.item_name,
      quantity: parseFloat(entry.quantity),
      unit: entry.unit,
      reason: entry.reason,
      timestamp: entry.timestamp,
      total_cost: parseFloat(entry.total_cost || 0)
    }));

    console.log('Sending response...');
    res.json(sanitizedEntries);
  } catch (err) {
    console.error('Export failed:', err);
    res.status(500).json({ 
      error: 'Failed to export entries',
      details: err.message
    });
  }
});

// Initialize the application
initialize().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
