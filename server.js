// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

// Resolve __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Railway Postgres
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure tables exist
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/entries — include cost calculations
app.get('/api/entries', async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        e.id,
        e.employee_name,
        e.item_name,
        e.quantity,
        e.unit,
        e.reason,
        e.timestamp,
        c.unit_cost,
        ROUND(e.quantity * c.unit_cost, 2) AS total_cost
      FROM wastage_entries e
      LEFT JOIN item_costs c ON e.item_name = c.item_name
      ORDER BY e.timestamp DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// GET /api/entries — list all entries
app.get('/api/entries', async (_req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM wastage_entries ORDER BY timestamp DESC'
  );
  res.json(rows);
});

// Health check
app.get('/', (_req, res) => res.send('OK'));

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
