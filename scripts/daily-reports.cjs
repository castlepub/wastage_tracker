// daily-report.js
const fetch = require('node-fetch');
const fs = require('fs');
const { Dropbox } = require('dropbox');
const dayjs = require('dayjs');

const API_URL = 'https://wastagetracker-production.up.railway.app/api/entries';
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;

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
    
    // 3. Initialize Dropbox with more detailed error handling
    console.log('Initializing Dropbox client...');
    if (!DROPBOX_TOKEN) {
      throw new Error('DROPBOX_TOKEN environment variable is not set');
    }
    console.log('Token exists:', DROPBOX_TOKEN.substring(0, 5) + '...');

    const dbx = new Dropbox({ 
      accessToken: DROPBOX_TOKEN,
      fetch: fetch
    });

    // 4. Check account access
    console.log('Verifying Dropbox access...');
    try {
      const account = await dbx.usersGetCurrentAccount();
      console.log('Connected to Dropbox as:', account.result.email);
    } catch (accountErr) {
      console.error('Failed to verify Dropbox account:', accountErr.message);
      if (accountErr.response) {
        const errorText = await accountErr.response.text();
        console.error('Account verification error details:', errorText);
      }
      throw new Error('Could not verify Dropbox access');
    }

    // 5. Upload file with explicit error handling
    console.log('Preparing to upload file...');
    const fileBuffer = Buffer.from(csvContent, 'utf8');
    
    try {
      console.log('Starting upload...');
      const uploadResponse = await dbx.filesUpload({
        path: `/${filename}`,
        contents: fileBuffer,
        mode: 'overwrite'
      });

      console.log('✅ Upload successful!');
      console.log('File path:', uploadResponse.result.path_display);
      console.log('Size:', Math.round(uploadResponse.result.size / 1024), 'KB');
      
      // 6. Verify the upload by trying to get metadata
      const metadata = await dbx.filesGetMetadata({
        path: uploadResponse.result.path_display
      });
      console.log('File metadata verified:', metadata.result.name);

    } catch (uploadErr) {
      console.error('Upload failed with error:', uploadErr.message);
      if (uploadErr.response) {
        const errorText = await uploadErr.response.text();
        console.error('Upload error details:', errorText);
      }
      throw uploadErr;
    }

  } catch (err) {
    console.error('❌ Failed to send report:', err.message);
    if (err.response) {
      try {
        const errorText = await err.response.text();
        console.error('Full error details:', errorText);
      } catch (e) {
        console.error('Could not read error details');
      }
    }
    // Make the script fail explicitly so GitHub Actions marks it as failed
    process.exit(1);
  }
})();
