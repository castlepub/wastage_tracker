// scripts/seedCosts.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

async function seedCosts(pool) {
  // Check if we need to seed by comparing row count
  try {
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM item_costs');
    if (count > 0) {
      console.log('✅ Item costs table already populated, skipping seed');
      return;
    }
  } catch (err) {
    // Table doesn't exist, we'll create it
  }

  return new Promise((resolve, reject) => {
    const rows = [];
    const csvPath = path.join(process.cwd(), 'data', 'stockLevels.csv');

    console.log('Reading CSV file...');
    fs.createReadStream(csvPath)
      .pipe(csv({
        separator: ';',
        mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').trim()
      }))
      .on('data', row => rows.push(row))
      .on('end', async () => {
        try {
          console.log(`Processing ${rows.length} items...`);

          // 1) Ensure table exists
          await pool.query(`
            CREATE TABLE IF NOT EXISTS item_costs (
              item_name TEXT PRIMARY KEY,
              unit_cost REAL NOT NULL,
              unit TEXT NOT NULL
            );
          `);

          // 2) Determine CSV columns
          const keys    = Object.keys(rows[0] || {});
          const nameKey = keys.find(k => k === 'Name');
          const costKey = keys.find(k => k === 'Cost price');
          const unitCol = keys.find(k => k === 'Package unit (stock management)');

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

          // 4) Prepare batch insert data
          const values = [];
          const params = [];
          let paramCount = 1;

          for (const r of rows) {
            const nameRaw = r[nameKey] || '';
            const name    = nameRaw.trim();
            if (!name) {
              continue;
            }

            let cost = parseFloat(r[costKey]);
            if (isNaN(cost)) cost = 0;

            let unit = (r[unitCol] || '').trim().toLowerCase();
            if (!unit) unit = inferUnit(r);

            values.push(`($${paramCount}, $${paramCount + 1}, $${paramCount + 2})`);
            params.push(name, cost, unit);
            paramCount += 3;
          }

          if (values.length > 0) {
            // 5) Perform batch insert
            const query = `
              INSERT INTO item_costs(item_name, unit_cost, unit)
              VALUES ${values.join(',')}
              ON CONFLICT(item_name) DO UPDATE
                SET unit_cost = EXCLUDED.unit_cost,
                    unit = EXCLUDED.unit;
            `;

            await pool.query(query, params);
          }

          console.log(`✅ ${values.length} items seeded`);
          resolve();
        } catch (err) {
          console.error('Seeding error:', err);
          reject(err);
        }
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

module.exports = seedCosts;
