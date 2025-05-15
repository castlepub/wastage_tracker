// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

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

// Test database connection
(async () => {
  try {
    const client = await db.connect();
    console.log('✅ Database connection successful');
    client.release();
  } catch (err) {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  }
})();

// Ensure tables exist on startup
(async () => {
  try {
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

    await db.query(`
      CREATE TABLE IF NOT EXISTS item_costs (
        item_name TEXT PRIMARY KEY,
        unit_cost REAL NOT NULL,
        unit TEXT NOT NULL
      );
    `);
    console.log('✅ item_costs table ready');
  } catch (err) {
    console.error('Failed to initialize tables:', err);
    process.exit(1);
  }
})();

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
    console.log('Parsed start:', new Date(start).toISOString());
    console.log('Parsed end:', new Date(end).toISOString());

    let query = `
      SELECT 
        w.*,
        w.timestamp AT TIME ZONE 'UTC' as utc_timestamp,
        ic.unit_cost,
        (w.quantity * ic.unit_cost) as total_cost
      FROM wastage_entries w
      LEFT JOIN item_costs ic ON w.item_name = ic.item_name
      WHERE w.timestamp >= $1::timestamptz
      AND w.timestamp < $2::timestamptz
      ORDER BY w.timestamp DESC
    `;
    
    const { rows } = await db.query(query, [start, end]);
    console.log('\nFiltered entries:', rows.length);
    console.log('\nExample entries:');
    if (rows.length > 0) {
      rows.slice(0, 3).forEach(row => {
        console.log(`Entry: ${row.item_name} at ${row.utc_timestamp} (${row.timestamp})`);
      });
    }
    console.log('===========================\n');
    
    res.json({ entries: rows });
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Health check
app.get('/', (_req, res) => res.send('OK'));

// Start server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Listening on port ${port}`));

// Graceful shutdown handler
function shutdownGracefully(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Set a timeout to force exit after 10 seconds
  const forceExit = setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
  
  // Clear the timeout if we close successfully
  forceExit.unref();
  
  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await Promise.race([
        db.end(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database shutdown timeout')), 5000)
        )
      ]);
      console.log('Database connections closed');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err.message);
      process.exit(1);
    }
  });

  // Stop accepting new connections immediately
  server.unref();
}

// Handle different termination signals
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));

// Also handle "kill" commands
process.on('SIGHUP', () => shutdownGracefully('SIGHUP'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdownGracefully('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdownGracefully('UNHANDLED_REJECTION');
});
