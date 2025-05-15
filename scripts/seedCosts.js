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

// Read the first few bytes of the file to check for BOM and encoding
const fileHeader = fs.readFileSync(csvPath, { encoding: null, flag: 'r' }).slice(0, 4);
console.log('File header bytes:', fileHeader);
console.log('File header string:', fileHeader.toString());

// Read first line of file to check headers
const firstLine = fs.readFileSync(csvPath, 'utf8').split('\n')[0];
console.log('First line of CSV:', firstLine);

console.log('Reading CSV file...');

// Add timeout for the entire process
const timeout = setTimeout(() => {
  console.error('Seeding process timed out after 30 seconds');
  process.exit(1);
}, 30000);

let headersPrinted = false;

const stream = fs.createReadStream(csvPath)
  .pipe(csv({
    separator: ';',
    mapHeaders: ({ header }) => {
      const cleaned = header.replace(/^\uFEFF/, '').trim();
      if (!headersPrinted) {
        console.log('CSV Header:', header);
        console.log('Cleaned Header:', cleaned);
      }
      return cleaned;
    }
  }));

stream.on('error', (error) => {
  console.error('Error reading CSV:', error);
  clearTimeout(timeout);
  process.exit(1);
});

stream.on('data', row => {
  // Print the first row's structure
  if (rows.length === 0) {
    console.log('First row structure:', JSON.stringify(row, null, 2));
    console.log('Available columns:', Object.keys(row));
    headersPrinted = true;
  }
  
  // Log row details for debugging
  console.log('Row:', {
    raw: row,
    name: row.name || row.Name || row.NAME,
    keys: Object.keys(row)
  });
  
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
    const keys = Object.keys(rows[0] || {});
    console.log('Available keys:', keys);
    
    // Try different possible column names
    const nameKey = keys.find(k => 
      k.toLowerCase() === 'name' || 
      k.toLowerCase().includes('item') ||
      k.toLowerCase().includes('product')
    );
    const costKey = keys.find(k => 
      k.toLowerCase().includes('cost') || 
      k.toLowerCase().includes('price')
    );
    const unitCol = keys.find(k => 
      k.toLowerCase().includes('unit') || 
      k.toLowerCase().includes('package')
    );

    console.log('Found columns:', {
      nameKey,
      costKey,
      unitCol,
      sampleValue: rows[0] ? {
        name: rows[0][nameKey],
        cost: rows[0][costKey],
        unit: rows[0][unitCol]
      } : null
    });

    if (!nameKey) {
      throw new Error('Could not find name column in CSV. Available columns: ' + keys.join(', '));
    }

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
