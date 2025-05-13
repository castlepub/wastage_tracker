// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();
app.use(cors());
app.use(bodyParser.json());

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

// GET /api/entries — list all entries (for Zapier or testing)
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
