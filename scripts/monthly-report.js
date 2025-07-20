// monthly-report.js
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fetch = require('node-fetch');

// Add UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set timezone to UTC
dayjs.tz.setDefault('UTC');

// Initialize configuration
const config = {
  now: dayjs().utc(),
  BASE_URL: process.env.APP_URL || 'https://wastagetracker-production.up.railway.app',
  EXPORT_TOKEN: process.env.EXPORT_TOKEN
};

// Validate required environment variables
if (!config.EXPORT_TOKEN) {
  console.error('❌ EXPORT_TOKEN environment variable is required');
  process.exit(1);
}

// Calculate time window - for last month's report
const now = dayjs().utc();
const firstDayLastMonth = now.subtract(1, 'month').startOf('month');
const lastDayLastMonth = now.subtract(1, 'month').endOf('month');

// Print startup information
console.log('\n=== Monthly Report Generation ===');
console.log('Current time (UTC):', now.format('YYYY-MM-DD HH:mm:ss'));
console.log('Reporting period:');
console.log('From:', firstDayLastMonth.format('YYYY-MM-DD HH:mm'), 'UTC');
console.log('To:  ', lastDayLastMonth.format('YYYY-MM-DD HH:mm'), 'UTC\n');

// Helper function for logging requests
async function loggedFetch(url, options = {}) {
  console.log('\n=== Making HTTP Request ===');
  console.log('URL:', url);
  console.log('Method:', options.method || 'GET');
  
  // Add authorization header
  options.headers = {
    ...options.headers,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.EXPORT_TOKEN}`
  };
  
  console.log('Headers:', {
    ...options.headers,
    Authorization: '(set)'
  });
  
  try {
    console.log('Starting request...');
    const response = await fetch(url, options);
    console.log('Response received:');
    console.log('Status:', response.status);
    console.log('Status text:', response.statusText);
    
    // Try to get response body
    let body;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        body = await response.json();
        console.log('Response body (JSON):', JSON.stringify(body, null, 2));
      } catch (e) {
        const text = await response.text();
        console.log('Failed to parse JSON. Raw response:', text);
        body = { error: text };
      }
    } else {
      const text = await response.text();
      console.log('Response body (text):', text);
      body = { error: text };
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${JSON.stringify(body)}`);
    }
    
    return body;
  } catch (err) {
    console.error('Request failed:');
    console.error('Error message:', err.message);
    console.error('Stack trace:', err.stack);
    throw err;
  }
}

// Main async function
async function main() {
  try {
    // Construct API URL
    const apiUrl = `${config.BASE_URL}/api/entries?start=${encodeURIComponent(firstDayLastMonth.toISOString())}&end=${encodeURIComponent(lastDayLastMonth.toISOString())}`;
    
    // Fetch data
    console.log('\nFetching entries from API...');
    const data = await loggedFetch(apiUrl);
    const entries = data.entries || [];

    // Filter and validate entries
    const validEntries = entries.filter(e => {
      const entryTime = dayjs(e.timestamp).utc();
      return entryTime.isAfter(firstDayLastMonth) && entryTime.isBefore(lastDayLastMonth);
    });

    console.log(`\nFound ${validEntries.length} valid entries`);

    // Calculate totals
    const totalCost = validEntries.reduce((sum, e) => sum + (e.total_cost || 0), 0);
    
    // Generate summary by item
    const itemSummary = Object.values(validEntries.reduce((acc, e) => {
      if (!acc[e.item_name]) {
        acc[e.item_name] = { 
          item: e.item_name, 
          qty: 0, 
          cost: 0,
          unit: e.unit 
        };
      }
      acc[e.item_name].qty += e.quantity;
      acc[e.item_name].cost += (e.total_cost || 0);
      return acc;
    }, {}));

    // Print report
    console.log('\n=== Monthly Wastage Report ===');
    console.log(`Period: ${firstDayLastMonth.format('DD.MM.YYYY')} - ${lastDayLastMonth.format('DD.MM.YYYY')}`);
    console.log(`Total Entries: ${validEntries.length}`);
    console.log(`Total Cost: €${totalCost.toFixed(2)}\n`);

    console.log('Summary by Item:');
    console.log('---------------');
    itemSummary.forEach(item => {
      console.log(`${item.item}:`);
      console.log(`  Quantity: ${item.qty} ${item.unit}`);
      console.log(`  Cost: €${item.cost.toFixed(2)}`);
    });

    console.log('\nDetailed Entries:');
    console.log('----------------');
    validEntries.forEach(e => {
      console.log(`${dayjs(e.timestamp).format('DD.MM.YYYY HH:mm')} - ${e.employee_name}`);
      console.log(`  Item: ${e.item_name}`);
      console.log(`  Quantity: ${e.quantity} ${e.unit}`);
      console.log(`  Cost: €${e.total_cost?.toFixed(2) || '0.00'}`);
      if (e.reason) console.log(`  Reason: ${e.reason}`);
      console.log('');
    });

  } catch (err) {
    console.error('\n❌ Error generating monthly report:');
    console.error(err);
    process.exit(1);
  }
}

// Run the main function
main(); 