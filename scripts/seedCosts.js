// scripts/seedCosts.js
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rows = [];

// Read semicolon-delimited CSV, strip BOM from headers
const csvPath = path.join(process.cwd(), 'data', 'stockLevels.csv');
fs.createReadStream(csvPath)
  .pipe(csv({ separator: ';', mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').trim() }))
  .on('data', row => rows.push(row))
  .on('end', async () => {
    try {
      // 1) Ensure table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS item_costs (
          item_name TEXT PRIMARY KEY,
          unit_cost REAL NOT NULL,
          unit TEXT NOT NULL
        );
      `);

      // 2) Identify CSV columns
      const sampleKeys = Object.keys(rows[0] || {});
      const nameKey  = sampleKeys.find(k => k.toLowerCase().includes('name'));
      const costKey  = sampleKeys.find(k => k.toLowerCase().includes('cost price') || k.toLowerCase().includes('unit cost'));
      const groupKey = sampleKeys.find(k => k.toLowerCase().includes('accounting group'));

      // 3) Infer unit from name or group
      const inferUnit = r => {
        const n = (r[nameKey] || '').toLowerCase();
        const g = r[groupKey] || '';
        if (/\d+\s?kg/.test(n) || /\d+\s?g\b/.test(n)) return 'g';
        if (/\d+\s?l\b/.test(n) || /\d+\s?ml\b/.test(n)) return 'ml';
        const bev = ['Spirit Bottles','Alkohol','Long Drinks','Mixers','Kegs','Ciders',
                     'Tap Craft Beer 0,3L','Tap Craft Beer 0,5L','Wein','GIN','Cocktails',
                     'Whiskey','Soft Drinks','Coffee'];
        if (bev.includes(g)) return 'ml';
        return 'pcs';
      };

      // 4) Seed table with valid rows
      for (const r of rows) {
        const name = r[nameKey]?.trim();
        const cost = parseFloat(r[costKey]);
        const unit = inferUnit(r);
        if (!name || isNaN(cost) || !unit) {
          console.warn('Skipping invalid row:', r);
          continue;
        }
        await pool.query(
          `INSERT INTO item_costs(item_name,unit_cost,unit)
           VALUES($1,$2,$3)
           ON CONFLICT(item_name) DO UPDATE
             SET unit_cost=EXCLUDED.unit_cost,unit=EXCLUDED.unit;`,
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
