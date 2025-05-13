// scripts/seedCosts.js
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rows = [];

// Build absolute path to CSV
const csvPath = path.join(process.cwd(), 'data', 'stockLevels.csv');

fs.createReadStream(csvPath)
  .pipe(csv())
  .on('data', row => rows.push(row))
  .on('end', async () => {
    try {
      // 1) Ensure the table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS item_costs (
          item_name TEXT PRIMARY KEY,
          unit_cost REAL NOT NULL,
          unit TEXT NOT NULL
        );
      `);

      // 2) Upsert each valid CSV row
      for (const r of rows) {
        const name = r['Item Name']?.trim();
        const cost = parseFloat(r['Unit Cost']);
        const unit = r['Default Unit']?.trim();

        if (!name || isNaN(cost) || !unit) {
          console.warn('Skipping invalid row:', r);
          continue;
        }

        await pool.query(
          `INSERT INTO item_costs(item_name, unit_cost, unit)
           VALUES ($1, $2, $3)
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
