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

// Ensure we're using exact ISO 8601 UTC timestamps in the API URL
const BASE_URL = process.env.APP_URL || 'https://wastagetracker-production.up.railway.app';
const API_ENDPOINT = '/api/entries';

// Health check URL
const HEALTH_CHECK_URL = BASE_URL;

// Make Dropbox token optional for testing
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
if (!DROPBOX_TOKEN) {
  console.warn('\n⚠️ Warning: DROPBOX_TOKEN not set. Will fetch data but skip uploading to Dropbox.');
}

// Print startup information
console.log('\n=== Startup Information ===');
console.log('Current time (UTC):', now.format('YYYY-MM-DD HH:mm:ss'));
console.log('API URL:', BASE_URL);
console.log('Dropbox enabled:', !!DROPBOX_TOKEN);

console.log('\nFetching entries for the period:');
console.log('From:', startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
console.log('To:  ', endDate.format('YYYY-MM-DD HH:mm'), 'UTC\n');

// Use the date of the start of the period for the filename
const reportDate = startDate.format('YYYY-MM-DD');

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to fetch with retries
async function fetchWithRetries(url, options = {}, maxRetries = 12, initialDelay = 20000) {
  let lastError;
  let delay = initialDelay;
  let totalWaitTime = 0;
  const maxTotalWaitTime = 300000; // 5 minutes total maximum wait time

  for (let i = 0; i < maxRetries; i++) {
    try {
      if (totalWaitTime >= maxTotalWaitTime) {
        throw new Error(`Exceeded maximum total wait time of ${maxTotalWaitTime/1000} seconds`);
      }

      console.log(`\nAttempt ${i + 1}/${maxRetries} to fetch data...`);
      console.log('Request URL:', url);
      console.log(`Total wait time so far: ${Math.round(totalWaitTime/1000)} seconds`);
      
      const res = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'WastageTracker-DailyReport/1.0',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          ...(options.headers || {})
        },
        timeout: 90000 // 90 second timeout for cold starts
      });
      
      console.log('Response status:', res.status);
      
      // Try to parse response as JSON first
      let errorData;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          errorData = await res.json();
        } catch (e) {
          const text = await res.text();
          errorData = { error: text };
        }
      } else {
        const text = await res.text();
        errorData = { error: text };
      }
      
      if (res.ok) {
        return errorData;
      }

      lastError = new Error(`API request failed with status ${res.status}: ${JSON.stringify(errorData)}`);
      
      // If it's a 502, 404, or 503, wait and retry (common during cold starts)
      if ([502, 404, 503].includes(res.status)) {
        // Progressive backoff with some randomization
        const baseWaitTime = delay * (1 + (i * 0.5));
        const jitter = Math.random() * 5000; // Add up to 5 seconds of random jitter
        const waitTime = Math.min(baseWaitTime + jitter, 120000); // Cap at 2 minutes per attempt
        
        console.log(`Got ${res.status} error (cold start), waiting ${Math.round(waitTime/1000)} seconds...`);
        await sleep(waitTime);
        totalWaitTime += waitTime;
        continue;
      }
      
      throw lastError;
    } catch (err) {
      lastError = err;
      console.log(`Request failed: ${err.message}`);
      
      // For network errors, also retry with increasing delays
      if (err.name === 'FetchError' || err.name === 'AbortError' || err.message.includes('timeout')) {
        if (i < maxRetries - 1 && totalWaitTime < maxTotalWaitTime) {
          const baseWaitTime = delay * (1 + (i * 0.5));
          const jitter = Math.random() * 5000;
          const waitTime = Math.min(baseWaitTime + jitter, 120000);
          
          console.log(`Network error, waiting ${Math.round(waitTime/1000)} seconds...`);
          await sleep(waitTime);
          totalWaitTime += waitTime;
          continue;
        }
      }
      
      throw lastError;
    }
  }
  
  throw lastError;
}

// Main async function
async function main() {
  // Pre-warm the application with multiple attempts
  console.log('\n=== Pre-warming Application ===');
  console.log('Sending initial requests to wake up the application...');
  
  let preWarmSuccess = false;
  
  // Try to pre-warm multiple times
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`Pre-warm attempt ${i + 1}/3...`);
      const res = await fetch(BASE_URL, { 
        method: 'GET',
        timeout: 10000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (res.ok) {
        console.log('Pre-warm request succeeded!');
        preWarmSuccess = true;
        break;
      } else {
        console.log(`Pre-warm attempt ${i + 1} returned status ${res.status}`);
      }
    } catch (err) {
      console.log(`Pre-warm attempt ${i + 1} failed: ${err.message}`);
    }
    
    // Wait between attempts
    if (i < 2) {
      console.log('Waiting 20 seconds before next pre-warm attempt...');
      await sleep(20000);
    }
  }

  if (!preWarmSuccess) {
    console.log('\n⚠️ All pre-warm attempts failed, but continuing anyway...');
  }
  
  // Give the application a moment to fully initialize
  console.log('Waiting 30 seconds for application to warm up...');
  await sleep(30000);

  // 1. Do the health check
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

  if (!data || !data.entries) {
    throw new Error('API response missing entries array');
  }

  const entries = data.entries;
  console.log(`Found ${entries.length} entries in API response`);
  
  // Strict filtering of entries to ensure they're in the correct time window
  const validEntries = entries.filter(e => {
      // Ensure we have a timestamp
      if (!e.timestamp) {
          console.log(`Skipping entry with no timestamp: ${JSON.stringify(e)}`);
          return false;
      }

      const entryTime = dayjs(e.timestamp).utc();
      const isValid = entryTime.isAfter(startDate) && entryTime.isBefore(endDate);
      
      if (!isValid) {
          console.log(`Filtered out entry: ${e.item_name} at ${entryTime.format('YYYY-MM-DD HH:mm:ss')} UTC`);
          console.log(`  - Outside window: ${startDate.format('YYYY-MM-DD HH:mm:ss')} to ${endDate.format('YYYY-MM-DD HH:mm:ss')} UTC`);
      }
      
      return isValid;
  });

  console.log(`\nValid entries in time window: ${validEntries.length}`);
  if (validEntries.length === 0) {
      console.log('No valid entries found in the specified time window');
      process.exit(0);
  }

  validEntries.forEach(e => {
      const entryTime = dayjs(e.timestamp).utc();
      console.log(`Entry: ${e.employee_name} - ${e.item_name} - ${e.quantity}${e.unit}`);
      console.log(`  Time: ${entryTime.format('YYYY-MM-DD HH:mm:ss')} UTC`);
      console.log(`  Raw timestamp: ${e.timestamp}`);
  });

  // Format CSV
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

  // Only try to upload to Dropbox if we have a token
  if (DROPBOX_TOKEN) {
    // ... Dropbox upload code ...
  } else {
    console.log('\n⚠️ Skipping Dropbox upload (no token provided)');
    console.log('CSV content that would have been uploaded:');
    console.log(csvContent);
  }
}

// Run the main function with proper error handling
(async () => {
  try {
    await main();
  } catch (err) {
    console.error('\n❌ Error running daily report:');
    console.error('Error message:', err.message);
    console.error('Please check:');
    console.error('1. The application is running on Railway');
    console.error('2. The APP_URL is correct:', BASE_URL);
    console.error('3. The application can be accessed from GitHub Actions');
    process.exit(1);
  }
})();
