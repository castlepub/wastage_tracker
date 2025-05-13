// scripts/seedCosts.js
import fs from 'fs';
import csv from 'csv-parser';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rows = [];

fs.createReadStream('data/stockLevels.csv')
  .pipe(csv())
  .on('data', row => rows.push(row))
  .on('end', async () => {
    // Ensure item_costs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_costs (
        item_name TEXT PRIMARY KEY,
        unit_cost REAL NOT NULL,
        unit TEXT NOT NULL
      );
    `);

    // Upsert each cost
    for (const r of rows) {
      await pool.query(
        `INSERT INTO item_costs(item_name, unit_cost, unit)
         VALUES($1,$2,$3)
         ON CONFLICT(item_name) DO UPDATE
           SET unit_cost = EXCLUDED.unit_cost,
               unit      = EXCLUDED.unit;`,
        [r['Item Name'], parseFloat(r['Unit Cost']), r['Default Unit']]
      );
    }

    console.log('✅ Costs seeded');
    process.exit(0);
  });
