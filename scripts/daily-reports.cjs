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

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to fetch with retries
async function fetchWithRetries(url, maxRetries = 3, initialDelay = 5000) {
  let lastError;
  let delay = initialDelay;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempt ${i + 1}/${maxRetries} to fetch data...`);
      const res = await fetch(url);
      
      if (res.ok) {
        return res;
      }

      const errorText = await res.text();
      lastError = new Error(`API request failed with status ${res.status}: ${errorText}`);
      
      // If it's a 502, wait and retry
      if (res.status === 502) {
        console.log(`Got 502 error, waiting ${delay/1000} seconds before retry...`);
        await sleep(delay);
        delay *= 2; // Double the delay for next attempt
        continue;
      }
      
      // For other errors, throw immediately
      throw lastError;
    } catch (err) {
      lastError = err;
      console.log(`Request failed: ${err.message}`);
      if (i < maxRetries - 1) {
        console.log(`Waiting ${delay/1000} seconds before retry...`);
        await sleep(delay);
        delay *= 2;
      }
    }
  }
  
  throw lastError;
}

// Calculate the time window
const now = dayjs().utc(); // Ensure we're working in UTC
console.log('\n=== Debug Info ===');
console.log('Current UTC time:', now.format('YYYY-MM-DD HH:mm:ss'));

// Calculate the 6 AM window
const today6AM = now.startOf('day').add(6, 'hour');
let startDate, endDate;

// If current time is before 6 AM UTC, use yesterday 6 AM to today 6 AM
// If current time is after 6 AM UTC, use today 6 AM to tomorrow 6 AM
if (now.isBefore(today6AM)) {
    startDate = today6AM.subtract(24, 'hour');
    endDate = today6AM;
} else {
    startDate = today6AM;
    endDate = today6AM.add(24, 'hour');
}

// Use the date of the start of the period for the filename
const reportDate = startDate.format('YYYY-MM-DD');

// Ensure we're using exact ISO 8601 UTC timestamps in the API URL
const API_URL = `https://wastagetracker-production.up.railway.app/api/entries?start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;

(async () => {
  try {
    // 1. Fetch entries
    console.log('\n=== Time Window Information ===');
    console.log('Current time:', now.format('YYYY-MM-DD HH:mm:ss'));
    console.log('Window start:', startDate.format('YYYY-MM-DD HH:mm:ss'));
    console.log('Window end:  ', endDate.format('YYYY-MM-DD HH:mm:ss'));
    console.log('\n=== API Request ===');
    console.log('API URL:', API_URL);
    console.log('Start date (ISO):', startDate.toISOString());
    console.log('End date (ISO):', endDate.toISOString());
    console.log('===========================\n');
    
    // First check if the server is up by hitting the health endpoint
    console.log('Checking server health...');
    try {
      const healthCheck = await fetch('https://wastagetracker-production.up.railway.app/');
      if (!healthCheck.ok) {
        throw new Error(`Health check failed with status ${healthCheck.status}`);
      }
      console.log('Server is healthy');
    } catch (err) {
      console.log('Health check failed:', err.message);
      console.log('Will try API endpoint anyway...');
    }

    // Try to fetch entries with retries
    console.log('Fetching entries from API...');
    const res = await fetchWithRetries(API_URL);
    const data = await res.json();

    const entries = data.entries || data;
    if (!Array.isArray(entries)) {
      throw new Error('API did not return a list');
    }
    console.log(`Found ${entries.length} entries for this period`);
    
    // Log each entry's timestamp for debugging
    console.log('\n=== Entries Found ===');
    console.log('Time window:', startDate.format('YYYY-MM-DD HH:mm:ss') + ' to ' + endDate.format('YYYY-MM-DD HH:mm:ss'));
    
    // Filter entries to ensure they're in the correct time window
    const validEntries = entries.filter(e => {
        const entryTime = dayjs(e.utc_timestamp || e.timestamp).utc();
        const isValid = entryTime.isAfter(startDate) && entryTime.isBefore(endDate);
        
        if (!isValid) {
            console.log(`Filtered out entry: ${e.item_name} at ${entryTime.format('YYYY-MM-DD HH:mm:ss')} UTC`);
            console.log(`  - Outside window: ${startDate.format('YYYY-MM-DD HH:mm:ss')} to ${endDate.format('YYYY-MM-DD HH:mm:ss')} UTC`);
        }
        
        return isValid;
    });

    console.log(`\nValid entries in time window: ${validEntries.length}`);
    validEntries.forEach(e => {
        const entryTime = dayjs(e.utc_timestamp || e.timestamp).utc();
        console.log(`Entry: ${e.employee_name} - ${e.item_name} - ${e.quantity}${e.unit}`);
        console.log(`  Time: ${entryTime.format('YYYY-MM-DD HH:mm:ss')} UTC`);
        console.log(`  Raw timestamp: ${e.timestamp}`);
        console.log(`  UTC timestamp: ${e.utc_timestamp || 'N/A'}`);
    });
    console.log('===========================\n');

    // 2. Format CSV
    const headers = ['Employee', 'Item', 'Qty', 'Unit', 'Reason', 'Time (UTC)', 'Cost (€)'];
    const rows = validEntries.map(e => [
      e.employee_name,
      e.item_name,
      e.quantity,
      e.unit,
      e.reason || '',
      dayjs(e.utc_timestamp || e.timestamp).utc().format('DD.MM.YYYY HH:mm:ss'),
      e.total_cost?.toFixed(2) || '0.00'
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

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
