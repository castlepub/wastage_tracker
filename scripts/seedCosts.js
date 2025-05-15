// scripts/seedCosts.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');

console.log('\n=== Cost Seeding Process ===');
console.log('Starting cost seeding...');

// Validate DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

console.log('Initializing database connection...');
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000
});

// Test database connection first
(async () => {
  try {
    console.log('Testing database connection...');
    const client = await pool.connect();
    console.log('Database connection successful');
    client.release();
  } catch (err) {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  }
})();

const rows = [];

// Path to your CSV
const csvPath = path.join(process.cwd(), 'data', 'stockLevels.csv');
console.log('CSV Path:', csvPath);

// Check if file exists
if (!fs.existsSync(csvPath)) {
  console.error('CSV file not found:', csvPath);
  process.exit(1);
}

console.log('Reading CSV file...');

// Add timeout for the entire process
const timeout = setTimeout(() => {
  console.error('Seeding process timed out after 30 seconds');
  process.exit(1);
}, 30000);

const stream = fs.createReadStream(csvPath)
  .pipe(csv({
    separator: ';',
    mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').trim()
  }));

stream.on('error', (error) => {
  console.error('Error reading CSV:', error);
  clearTimeout(timeout);
  process.exit(1);
});

stream.on('data', row => {
  console.log('Read row:', row.name || 'unnamed');
  rows.push(row);
});

stream.on('end', async () => {
  console.log(`Finished reading CSV. Found ${rows.length} rows.`);
  try {
    console.log('Creating item_costs table if not exists...');
    // 1) Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_costs (
        item_name TEXT PRIMARY KEY,
        unit_cost REAL NOT NULL,
        unit TEXT NOT NULL
      );
    `);
    console.log('Table ready');

    // 2) Determine CSV columns
    console.log('Analyzing CSV structure...');
    const keys    = Object.keys(rows[0] || {});
    const nameKey = keys.find(k => k.toLowerCase() === 'name');
    const costKey = keys.find(k => k.toLowerCase().includes('cost price'));
    const unitCol = keys.find(k => k.toLowerCase().includes('package unit'));

    if (!nameKey) {
      throw new Error('Could not find name column in CSV');
    }
    console.log('Found columns:', { nameKey, costKey, unitCol });

    // 3) Unit inference
    const inferUnit = r => {
      const n = (r[nameKey] || '').toLowerCase();
      const g = (r['Accounting group'] || '').trim();
      if (/\d+\s?kg/.test(n) || /\d+\s?g\b/.test(n)) return 'g';
      if (/\d+\s?l\b/.test(n) || /\d+\s?ml\b/.test(n)) return 'ml';
      const bev = ['Spirit Bottles','Alkohol','Long Drinks','Mixers','Kegs','Ciders',
                   'Tap Craft Beer 0,3L','Tap Craft Beer 0,5L','Wein','GIN','Cocktails',
                   'Whiskey','Soft Drinks','Coffee'];
      if (bev.includes(g)) return 'ml';
      return 'pcs';
    };

    // 4) Seed every row (cost defaults to 0)
    console.log('Starting to seed items...');
    let seeded = 0;
    for (const r of rows) {
      const nameRaw = r[nameKey] || '';
      const name    = nameRaw.trim();
      if (!name) {
        console.warn('Skipping row with no name:', r);
        continue;
      }

      let cost = parseFloat(r[costKey]);
      if (isNaN(cost)) cost = 0;

      let unit = (r[unitCol] || '').trim().toLowerCase();
      if (!unit) unit = inferUnit(r);

      await pool.query(
        `INSERT INTO item_costs(item_name, unit_cost, unit)
         VALUES($1,$2,$3)
         ON CONFLICT(item_name) DO UPDATE
           SET unit_cost = EXCLUDED.unit_cost,
               unit      = EXCLUDED.unit;`,
        [name, cost, unit]
      );
      seeded++;
      if (seeded % 10 === 0) {
        console.log(`Seeded ${seeded}/${rows.length} items...`);
      }
    }

    console.log(`✅ Successfully seeded ${seeded} items`);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
    await pool.end();
    process.exit(0);
  }
});
