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

// Calculate the time window
const now = dayjs().utc(); // Ensure we're working in UTC

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

console.log('\nFetching entries for the period:');
console.log('From:', startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
console.log('To:  ', endDate.format('YYYY-MM-DD HH:mm'), 'UTC\n');

// Use the date of the start of the period for the filename
const reportDate = startDate.format('YYYY-MM-DD');

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to fetch with retries
async function fetchWithRetries(url, options = {}, maxRetries = 3, initialDelay = 5000) {
  let lastError;
  let delay = initialDelay;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`\nAttempt ${i + 1}/${maxRetries} to fetch data...`);
      console.log('Request URL:', url);
      console.log('Request options:', JSON.stringify(options, null, 2));
      
      const res = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      
      console.log('Response status:', res.status);
      console.log('Response headers:', JSON.stringify(Object.fromEntries([...res.headers]), null, 2));
      
      // Try to parse response as JSON first
      let errorData;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          errorData = await res.json();
          console.log('Response body (JSON):', JSON.stringify(errorData, null, 2));
        } catch (e) {
          const text = await res.text();
          console.log('Response body (text):', text);
          errorData = { error: text };
        }
      } else {
        const text = await res.text();
        console.log('Response body (text):', text);
        errorData = { error: text };
      }
      
      if (res.ok) {
        return errorData; // If successful, return the parsed JSON
      }

      lastError = new Error(`API request failed with status ${res.status}: ${JSON.stringify(errorData)}`);
      
      // If it's a 502 or 404, wait and retry
      if (res.status === 502 || res.status === 404) {
        console.log(`Got ${res.status} error, waiting ${delay/1000} seconds before retry...`);
        await sleep(delay);
        delay *= 2; // Double the delay for next attempt
        continue;
      }
      
      // For other errors, throw immediately
      throw lastError;
    } catch (err) {
      lastError = err;
      console.log(`Request failed: ${err.message}`);
      if (err.cause) {
        console.log('Error cause:', err.cause);
      }
      
      if (i < maxRetries - 1) {
        console.log(`Waiting ${delay/1000} seconds before retry...`);
        await sleep(delay);
        delay *= 2;
      }
    }
  }
  
  throw lastError;
}

// Ensure we're using exact ISO 8601 UTC timestamps in the API URL
const BASE_URL = 'https://wastagetracker-production.up.railway.app';
const API_ENDPOINT = '/api/entries';

// Health check URL
const HEALTH_CHECK_URL = BASE_URL;

// Make Dropbox token optional for testing
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
if (!DROPBOX_TOKEN) {
  console.warn('\n⚠️ Warning: DROPBOX_TOKEN not set. Will fetch data but skip uploading to Dropbox.');
}

(async () => {
  try {
    // 1. First do a health check
    console.log('\n=== Health Check ===');
    console.log('Testing application health...');
    
    const healthData = await fetchWithRetries(HEALTH_CHECK_URL, {
      method: 'GET'
    });
    console.log('Health check response:', healthData);

    // 2. Then try to fetch entries
    console.log('\n=== Fetching Entries ===');
    
    // Try without query parameters first
    console.log('Testing API endpoint without parameters...');
    const testData = await fetchWithRetries(`${BASE_URL}${API_ENDPOINT}`, {
      method: 'GET'
    });
    console.log('API test response:', testData);

    // Now try with query parameters
    console.log('\nFetching entries with date range...');
    const API_URL = `${BASE_URL}${API_ENDPOINT}?start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`;
    console.log('Full URL:', API_URL);
    
    const data = await fetchWithRetries(API_URL, {
      method: 'GET'
    });

    const entries = data.entries || data;
    if (!Array.isArray(entries)) {
      throw new Error(`API did not return a list. Response: ${JSON.stringify(data)}`);
    }
    
    console.log(`Found ${entries.length} entries for this period`);
    
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

    // Format CSV
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

    // Only try to upload to Dropbox if we have a token
    if (DROPBOX_TOKEN) {
      // ... Dropbox upload code ...
    } else {
      console.log('\n⚠️ Skipping Dropbox upload (no token provided)');
      console.log('CSV content that would have been uploaded:');
      console.log(csvContent);
    }
  } catch (err) {
    console.error('❌ Failed to send report:', err.message);
    process.exit(1);
  }
})();
