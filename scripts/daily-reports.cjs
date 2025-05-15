// daily-report.js
const fetch = require('node-fetch');
const fs = require('fs');
const { Dropbox } = require('dropbox');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Add UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set timezone to UTC
dayjs.tz.setDefault('UTC');

// Get the date range from 6 AM today to 6 AM tomorrow
const now = dayjs().utc();
const today6AM = now.startOf('day').add(6, 'hour');
const tomorrow6AM = today6AM.add(24, 'hour');

// If current time is before 6 AM, we need to use yesterday 6 AM to today 6 AM
const startDate = (now.isBefore(today6AM) ? today6AM.subtract(24, 'hour') : today6AM).toISOString();
const endDate = (now.isBefore(today6AM) ? today6AM : tomorrow6AM).toISOString();

// Use the date of the end of the period (when the report is generated) for the filename
const reportDate = dayjs(endDate).subtract(1, 'minute').format('YYYY-MM-DD');

const API_URL = `https://castle-wastage-tracker-production.up.railway.app/api/entries?start=${startDate}&end=${endDate}`;
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;

(async () => {
  try {
    // 1. Fetch entries
    console.log('Fetching entries for the period:');
    console.log('From:', dayjs(startDate).format('YYYY-MM-DD HH:mm'), 'UTC');
    console.log('To:  ', dayjs(endDate).format('YYYY-MM-DD HH:mm'), 'UTC');
    
    const res = await fetch(API_URL);
    if (!res.ok) {
      throw new Error(`API request failed with status ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();

    const entries = data.entries || data;
    if (!Array.isArray(entries)) {
      throw new Error('API did not return a list');
    }
    console.log(`Found ${entries.length} entries for this period`);

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
    const filename = `wastage-${reportDate}.csv`;
    
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
