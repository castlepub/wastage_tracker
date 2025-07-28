// test-daily-report.js - Debug version without email sending
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fetch = require('node-fetch');

// Add UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set timezone to UTC
dayjs.tz.setDefault('UTC');

const DEFAULT_URL = 'https://wastagetracker-production.up.railway.app';

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to fetch with retries
async function fetchWithRetries(url, options = {}, maxRetries = 3, initialDelay = 5000) {
  let lastError;
  let delay = initialDelay;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`\nAttempt ${i + 1}/${maxRetries} to fetch data...`);
      console.log('Fetching URL:', url);
      
      const res = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPORT_TOKEN}`,
          ...(options.headers || {})
        }
      });
      
      console.log('Response status:', res.status);
      console.log('Response headers:', Object.fromEntries(res.headers.entries()));
      
      if (!res.ok) {
        const errorText = await res.text();
        console.log('Error response body:', errorText);
        throw new Error(`API request failed with status ${res.status}: ${errorText}`);
      }

      return await res.json();
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

async function testReport() {
  try {
    // Test different date ranges
    const testCases = [
      { name: "Today", days: 0 },
      { name: "Yesterday", days: 1 },
      { name: "2 days ago", days: 2 },
      { name: "3 days ago", days: 3 },
      { name: "1 week ago", days: 7 }
    ];

    for (const testCase of testCases) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`TESTING: ${testCase.name} (${testCase.days} days ago)`);
      console.log(`${'='.repeat(50)}`);

      // Calculate time window
      const startDate = dayjs().utc().subtract(testCase.days, 'day').startOf('day').add(6, 'hour');
      const endDate = startDate.add(24, 'hour');

      console.log('Date range:');
      console.log('From:', startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
      console.log('To:  ', endDate.format('YYYY-MM-DD HH:mm'), 'UTC');

      // Construct base URL
      let baseUrl = process.env.APP_URL || DEFAULT_URL;
      baseUrl = baseUrl.replace(/\/+$/, '');
      
      // Construct API URL
      const apiUrl = `${baseUrl}/api/entries?start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`;
      console.log('\nAPI URL:', apiUrl);

      try {
        // Fetch data
        const data = await fetchWithRetries(apiUrl);
        const entries = data.entries || [];

        console.log(`\n✅ SUCCESS: Found ${entries.length} entries`);
        
        if (entries.length > 0) {
          console.log('\nFirst 5 entries:');
          entries.slice(0, 5).forEach((entry, index) => {
            console.log(`  ${index + 1}. ${dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm')} - ${entry.employee_name} - ${entry.item_name} (${entry.quantity} ${entry.unit})`);
          });

          // Calculate total cost
          const totalCost = entries.reduce((sum, e) => sum + (e.total_cost || 0), 0);
          console.log(`\nTotal cost: €${totalCost.toFixed(2)}`);
          
          // Break after finding data
          console.log(`\n🎉 FOUND DATA! This date range has entries.`);
          break;
        } else {
          console.log('\n❌ No entries found for this date range');
        }
      } catch (err) {
        console.log(`\n💥 ERROR: ${err.message}`);
      }
    }

    // Also test fetching ALL entries (no date filter)
    console.log(`\n${'='.repeat(50)}`);
    console.log(`TESTING: ALL ENTRIES (no date filter)`);
    console.log(`${'='.repeat(50)}`);

    let baseUrl = process.env.APP_URL || DEFAULT_URL;
    baseUrl = baseUrl.replace(/\/+$/, '');
    const allEntriesUrl = `${baseUrl}/api/entries`;
    
    console.log('API URL:', allEntriesUrl);
    
    try {
      const data = await fetchWithRetries(allEntriesUrl);
      const entries = data.entries || [];
      
      console.log(`\n✅ SUCCESS: Found ${entries.length} total entries in database`);
      
      if (entries.length > 0) {
        console.log('\nMost recent entries:');
        entries.slice(0, 10).forEach((entry, index) => {
          console.log(`  ${index + 1}. ${dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm')} - ${entry.employee_name} - ${entry.item_name}`);
        });

        console.log('\nOldest entries:');
        entries.slice(-5).forEach((entry, index) => {
          console.log(`  ${index + 1}. ${dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm')} - ${entry.employee_name} - ${entry.item_name}`);
        });
      }
    } catch (err) {
      console.log(`\n💥 ERROR: ${err.message}`);
    }

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }
  }
}

// Run the test
console.log('🔍 Starting daily report debug test...');
console.log('Environment variables:');
console.log('- APP_URL:', process.env.APP_URL || '(not set, using default)');
console.log('- EXPORT_TOKEN:', process.env.EXPORT_TOKEN ? '(set)' : '(not set)');

testReport(); 