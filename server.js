// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
// Serve static front-end
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Postgres
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure tables exist on startup
(async () => {
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
})();

// POST /api/entry — log a wastage entry
app.post('/api/entry', async (req, res) => {
  const { employeeName, itemName, quantity, unit, reason } = req.body;
  try {
    await db.query(
      `INSERT INTO wastage_entries(employee_name, item_name, quantity, unit, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [employeeName, itemName, quantity, unit, reason || null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
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
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to fetch items' });
  }
});

// GET /api/entries — wrapped in { entries: [...] }
app.get('/api/entries', async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, employee_name, item_name, quantity, unit, reason, timestamp
      FROM wastage_entries
      ORDER BY timestamp DESC
    `);
    res.json({ entries: rows });  // WRAPPED in 'entries'
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (_req, res) => res.send('OK'));

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
