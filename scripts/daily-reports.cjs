// daily-report.js
const fetch = require('node-fetch');
const fs = require('fs');
const { Dropbox } = require('dropbox');
const dayjs = require('dayjs');

const API_URL = 'https://wastagetracker-production.up.railway.app/api/entries';
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
// Remove /Apps prefix - Dropbox will automatically put files in the app folder
const DROPBOX_FOLDER = '/reports'; // Just use a subfolder in the app's root

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
    
    // 3. Initialize Dropbox
    console.log('Connecting to Dropbox...');
    const dbx = new Dropbox({ 
      accessToken: DROPBOX_TOKEN,
      fetch: fetch
    });

    // 4. Try to create reports folder (ignore if exists)
    if (DROPBOX_FOLDER !== '/') {
      try {
        console.log('Creating folder if needed:', DROPBOX_FOLDER);
        await dbx.filesCreateFolderV2({
          path: DROPBOX_FOLDER,
          autorename: false
        });
        console.log('Folder created or already exists');
      } catch (err) {
        // Ignore path_conflict error (means folder exists)
        if (!err.message.includes('path/conflict')) {
          console.log('Warning: Could not create folder:', err.message);
          // Continue anyway - we'll try to upload to root
        }
      }
    }

    // 5. Upload file
    const filePath = DROPBOX_FOLDER === '/' ? `/${filename}` : `${DROPBOX_FOLDER}/${filename}`;
    console.log('Uploading to:', filePath);
    
    try {
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
    } catch (uploadErr) {
      // If folder upload failed, try uploading to root
      if (DROPBOX_FOLDER !== '/') {
        console.log('Retrying upload to root folder...');
        const rootUploadResponse = await dbx.filesUpload({
          path: `/${filename}`,
          contents: fileBuffer,
          mode: { '.tag': 'overwrite' },
          autorename: true
        });
        console.log('✅ Upload to root successful!');
        console.log('File path:', rootUploadResponse.result.path_display);
        console.log('Size:', Math.round(rootUploadResponse.result.size / 1024), 'KB');
      } else {
        throw uploadErr;
      }
    }

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
