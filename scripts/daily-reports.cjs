// daily-report.js
const fetch = require('node-fetch');
const fs = require('fs');
const { Dropbox } = require('dropbox');
const dayjs = require('dayjs');

const API_URL = 'https://wastagetracker-production.up.railway.app/api/entries';
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
// Try uploading directly to root
const DROPBOX_FOLDER = '/';

(async () => {
  try {
    // 1. Fetch entries
    console.log('Fetching entries from API...');
    const res = await fetch(API_URL);
    if (!res.ok) {
      throw new Error(`API request failed with status ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();

    const entries = data.entries || data;
    if (!Array.isArray(entries)) {
      throw new Error('API did not return a list');
    }
    console.log(`Found ${entries.length} entries`);

    // 2. Format CSV
    const headers = ['Employee', 'Item', 'Qty', 'Unit', 'Reason', 'Time', 'Cost (€)'];
    const rows = entries.map(e => [
      e.employee_name,
      e.item_name,
      e.quantity,
      e.unit,
      e.reason || '',
      dayjs(e.timestamp).format('DD.MM.YYYY HH:mm'),
      e.total_cost?.toFixed(2) || '0.00'
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const filename = `wastage-${dayjs().format('YYYY-MM-DD')}.csv`;
    const filePath = `${DROPBOX_FOLDER}${filename}`;
    
    // 3. Initialize Dropbox
    console.log('Connecting to Dropbox...');
    const dbx = new Dropbox({ 
      accessToken: DROPBOX_TOKEN,
      fetch: fetch
    });

    // 4. Upload file
    console.log('Uploading to:', filePath);
    const fileBuffer = Buffer.from(csvContent, 'utf8');

    const uploadResponse = await dbx.filesUpload({
      path: filePath,
      contents: fileBuffer,
      mode: { '.tag': 'overwrite' },
      autorename: true // Enable auto-rename in case of conflicts
    });

    console.log('✅ Upload successful!');
    console.log('File path:', uploadResponse.result.path_display);
    console.log('Size:', Math.round(uploadResponse.result.size / 1024), 'KB');

  } catch (err) {
    console.error('❌ Failed to send report:', err.message);
    if (err.response) {
      try {
        const errorDetails = await err.response.text();
        console.error('Error details:', errorDetails);
      } catch (e) {
        console.error('Could not read error details');
      }
    }
    // Make the script fail explicitly so GitHub Actions marks it as failed
    process.exit(1);
  }
})();
