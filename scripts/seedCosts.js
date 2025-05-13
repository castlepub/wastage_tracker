// scripts/seedCosts.js
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rows = [];

// Build path to your CSV
const csvPath = path.join(process.cwd(), 'data', 'stockLevels.csv');

fs.createReadStream(csvPath)
  .pipe(csv())
  .on('data', row => rows.push(row))
  .on('end', async () => {
    try {
      // 1) Create table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS item_costs (
          item_name TEXT PRIMARY KEY,
          unit_cost REAL NOT NULL,
          unit TEXT NOT NULL
        );
      `);

      // 2) Identify the right columns (handles BOM in header names)
      const keys     = Object.keys(rows[0] || {});
      const nameKey  = keys.find(k => k.toLowerCase().includes('item name'));
      const costKey  = keys.find(k => k.toLowerCase().includes('cost price') || k.toLowerCase().includes('unit cost'));
      const groupKey = keys.find(k => k.toLowerCase().includes('accounting group'));

      // 3) Unit inference function
      function inferUnit(r) {
        const name  = (r[nameKey] || '').toLowerCase();
        const group = r[groupKey] || '';
        if (/\d+\s?kg/.test(name) || /\d+\s?g\b/.test(name)) return 'g';
        if (/\d+\s?l\b/.test(name) || /\d+\s?ml\b/.test(name)) return 'ml';
        const bev = ['Spirit Bottles','Alkohol','Long Drinks','Mixers','Kegs','Ciders','Tap Craft Beer 0,3L','Tap Craft Beer 0,5L','Wein','GIN','Cocktails','Whiskey','Soft Drinks','Coffee'];
        if (bev.includes(group)) return 'ml';
        return 'pcs';
      }

      // 4) Upsert each valid row
      for (const r of rows) {
        const name  = r[nameKey]?.trim();
        const cost  = parseFloat(r[costKey]);
        const unit  = inferUnit(r);

        // Skip if anything’s missing or invalid
        if (!name || isNaN(cost) || !unit) {
          console.warn('Skipping invalid row:', r);
          continue;
        }

        await pool.query(
          `INSERT INTO item_costs(item_name, unit_cost, unit)
           VALUES ($1,$2,$3)
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
