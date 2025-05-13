// scripts/seedCosts.js
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rows = [];

const csvPath = path.join(process.cwd(), 'data', 'stockLevels.csv');
fs.createReadStream(csvPath)
  .pipe(csv({
    separator: ';',
    mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').trim()
  }))
  .on('data', row => rows.push(row))
  .on('end', async () => {
    try {
      // 1) Ensure the table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS item_costs (
          item_name TEXT PRIMARY KEY,
          unit_cost REAL NOT NULL,
          unit TEXT NOT NULL
        );
      `);

      // 2) Figure out column keys
      const keys   = Object.keys(rows[0] || {});
      const nameKey = keys.find(k => k.toLowerCase() === 'name');
      const costKey = keys.find(k => k.toLowerCase().includes('cost price'));
      const unitCol = keys.find(k => k.toLowerCase().includes('package unit'));

      // 3) Upsert each valid row
      for (const r of rows) {
        const name = (r[nameKey] || '').trim();
        const cost = parseFloat(r[costKey]);
        let   unit = (r[unitCol] || '').trim().toLowerCase();

        if (!name || isNaN(cost)) {
          console.warn('Skipping invalid row:', r);
          continue;
        }
        if (!unit) unit = 'pcs';  // fallback

        await pool.query(
          `INSERT INTO item_costs(item_name, unit_cost, unit)
           VALUES($1,$2,$3)
           ON CONFLICT(item_name) DO UPDATE
             SET unit_cost = EXCLUDED.unit_cost,
                 unit      = EXCLUDED.unit;`,
          [name, cost, unit]
        );
      }

      console.log('✅ Costs seeded');
    } catch (err) {
      console.error('Seeding error:', err);
    } finally {
      process.exit(0);
    }
  });
