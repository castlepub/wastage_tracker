// update-items.js
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const csv = require('csv-parse');

// Validate database URL
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

// Connect to Postgres
const db = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000
});

async function updateItems() {
  try {
    // Read the CSV file
    const csvPath = path.join(__dirname, '..', 'data', 'export (1).csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');

    // Parse CSV
    const records = await new Promise((resolve, reject) => {
      csv.parse(fileContent, {
        columns: true,
        delimiter: ';',
        skip_empty_lines: true
      }, (err, records) => {
        if (err) reject(err);
        else resolve(records);
      });
    });

    // Filter and transform records
    const items = records
      .filter(record => 
        // Only include items with a cost price and name
        record['Cost price'] && 
        record['Name'] &&
        // Exclude groups and sub-items
        record['Type'] !== 'group' &&
        record['Type'] !== 'sub-item'
      )
      .map(record => ({
        item_name: record['Name'].trim(),
        unit_cost: parseFloat(record['Cost price'].replace(',', '.')),
        unit: record['Package unit (stock management)']?.trim() || 'UNIT'
      }));

    // Begin transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Clear existing items
      await client.query('DELETE FROM item_costs');

      // Insert new items
      for (const item of items) {
        await client.query(
          'INSERT INTO item_costs (item_name, unit_cost, unit) VALUES ($1, $2, $3)',
          [item.item_name, item.unit_cost, item.unit]
        );
      }

      await client.query('COMMIT');
      console.log(`✅ Successfully updated ${items.length} items`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Failed to update items:', err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run the update
updateItems(); 