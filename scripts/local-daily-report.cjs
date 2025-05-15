#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const { Dropbox } = require('dropbox');

// Add UTC plugin
dayjs.extend(utc);

// Helper function to log with timestamp
const log = (msg, ...args) => {
  const time = dayjs().utc().format('YYYY-MM-DD HH:mm:ss');
  console.log(`[${time}] ${msg}`, ...args);
};

async function main() {
  try {
    log('Starting daily report generation...');

    // Calculate time window (6 AM to 6 AM UTC)
    const now = dayjs().utc();
    const today6AM = now.startOf('day').add(6, 'hour');
    const startDate = now.isBefore(today6AM) 
      ? today6AM.subtract(24, 'hour')
      : today6AM;
    const endDate = startDate.add(24, 'hour');

    log('Time window:');
    log('From:', startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
    log('To:  ', endDate.format('YYYY-MM-DD HH:mm'), 'UTC');

    // Read entries from data file
    const dataPath = path.join(__dirname, '..', 'data', 'entries.json');
    log('Reading entries from:', dataPath);
    
    let entries = [];
    try {
      const data = fs.readFileSync(dataPath, 'utf8');
      entries = JSON.parse(data);
      log(`Found ${entries.length} total entries`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        log('No entries file found, creating empty one');
        fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
        fs.writeFileSync(dataPath, '[]');
      } else {
        throw err;
      }
    }

    // Filter entries in time window
    const validEntries = entries.filter(e => {
      const entryTime = dayjs(e.timestamp).utc();
      return entryTime.isAfter(startDate) && entryTime.isBefore(endDate);
    });

    log(`Found ${validEntries.length} entries in time window`);

    if (validEntries.length === 0) {
      log('No entries found in time window, exiting');
      return;
    }

    // Format entries for CSV
    const headers = ['Employee', 'Item', 'Qty', 'Unit', 'Reason', 'Time (UTC)', 'Cost (€)'];
    const rows = validEntries.map(e => [
      e.employee_name,
      e.item_name,
      e.quantity,
      e.unit,
      e.reason || '',
      dayjs(e.timestamp).utc().format('DD.MM.YYYY HH:mm:ss'),
      e.total_cost?.toFixed(2) || '0.00'
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    // Generate filename with date
    const dateStr = startDate.format('YYYY-MM-DD');
    const filename = `wastage-report-${dateStr}.csv`;

    if (!process.env.DROPBOX_TOKEN) {
      log('No Dropbox token provided, saving locally');
      const outputPath = path.join(__dirname, '..', 'data', filename);
      fs.writeFileSync(outputPath, csvContent);
      log('Report saved to:', outputPath);
      return;
    }

    // Upload to Dropbox
    log('Uploading to Dropbox...');
    const dbx = new Dropbox({ accessToken: process.env.DROPBOX_TOKEN });
    
    try {
      await dbx.filesUpload({
        path: `/${filename}`,
        contents: csvContent,
        mode: 'overwrite'
      });
      log('✅ Successfully uploaded to Dropbox:', filename);
    } catch (err) {
      throw new Error(`Failed to upload to Dropbox: ${err.message}`);
    }

  } catch (err) {
    log('❌ Error:', err.message);
    process.exit(1);
  }
}

// Run the script
main(); 
