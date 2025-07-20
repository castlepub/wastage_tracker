#!/usr/bin/env node

// Force synchronous logging
const util = require('util');
const log = (msg, ...args) => {
  process.stdout.write(util.format(msg, ...args) + '\n');
};
const error = (msg, ...args) => {
  process.stderr.write(util.format(msg, ...args) + '\n');
};

// Add Resend import at the top
const { Resend } = require('resend');

// Immediate logging to debug script startup
log('\n=== SCRIPT EXECUTION STARTED ===');
log('Process ID:', process.pid);
log('Node version:', process.version);
log('Platform:', process.platform);
log('Working directory:', process.cwd());
log('Script path:', __filename);
log('Command line args:', process.argv);

// Verify the script is loaded
error('\nDEBUG: Script is being executed');

// Add error logging as early as possible
process.on('uncaughtException', (err) => {
  error('\n❌ Uncaught Exception:');
  error('Error message:', err.message);
  error('Stack trace:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  error('\n❌ Unhandled Promise Rejection:');
  error('Error message:', err?.message);
  error('Stack trace:', err?.stack);
  process.exit(1);
});

// Try importing dependencies with error handling
let fetch, fs, Dropbox, dayjs, utc, timezone;

try {
  log('\n=== Loading Dependencies ===');
  
  log('Loading node-fetch...');
  fetch = require('node-fetch');
  
  log('Loading fs...');
  fs = require('fs');
  
  log('Loading dropbox...');
  Dropbox = require('dropbox').Dropbox;
  
  log('Loading dayjs and plugins...');
  dayjs = require('dayjs');
  utc = require('dayjs/plugin/utc');
  timezone = require('dayjs/plugin/timezone');
  
  log('All dependencies loaded successfully');
} catch (err) {
  error('\n❌ Failed to load dependencies:');
  error('Error message:', err.message);
  error('Stack trace:', err.stack);
  process.exit(1);
}

// Add UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set timezone to UTC
dayjs.tz.setDefault('UTC');

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Initialize configuration
const config = {
  now: dayjs().utc(),
  BASE_URL: process.env.APP_URL || 'https://wastagetracker-production.up.railway.app',
  EXPORT_TOKEN: process.env.EXPORT_TOKEN
};

// Validate required environment variables
if (!config.EXPORT_TOKEN) {
  error('❌ EXPORT_TOKEN environment variable is required');
  process.exit(1);
}

// Calculate time window
const today6AM = config.now.startOf('day').add(6, 'hour');
config.startDate = config.now.isBefore(today6AM) 
  ? today6AM.subtract(24, 'hour')
  : today6AM;
config.endDate = config.startDate.add(24, 'hour');

// Print startup information immediately
log('\n=== Startup Information ===');
log('Current time (UTC):', config.now.format('YYYY-MM-DD HH:mm:ss'));
log('API URL:', config.BASE_URL);
log('Export token:', config.EXPORT_TOKEN ? '(set)' : '(not set)');

log('\nFetching entries for the period:');
log('From:', config.startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
log('To:  ', config.endDate.format('YYYY-MM-DD HH:mm'), 'UTC\n');

// Basic connectivity test
async function testConnectivity() {
  try {
    const dns = require('dns');
    const url = new URL(config.BASE_URL);
    
    log('\n=== Testing Connectivity ===');
    log('Testing DNS resolution for:', url.hostname);
    
    const addresses = await new Promise((resolve, reject) => {
      dns.resolve(url.hostname, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    });
    
    log('DNS resolution successful:', addresses);
    return true;
  } catch (err) {
    error('DNS resolution failed:', err.message);
    return false;
  }
}

// Helper function for logging requests
async function loggedFetch(url, options = {}) {
  log('\n=== Making HTTP Request ===');
  log('URL:', url);
  log('Method:', options.method || 'GET');
  
  // Add authorization header
  options.headers = {
    ...options.headers,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.EXPORT_TOKEN}`
  };
  
  log('Headers:', {
    ...options.headers,
    Authorization: '(set)'
  });
  
  try {
    log('Starting request...');
    const response = await fetch(url, options);
    log('Response received:');
    log('Status:', response.status);
    log('Status text:', response.statusText);
    
    // Try to get response body
    let body;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        body = await response.json();
        log('Response body (JSON):', JSON.stringify(body, null, 2));
      } catch (e) {
        const text = await response.text();
        log('Failed to parse JSON. Raw response:', text);
        body = { error: text };
      }
    } else {
      const text = await response.text();
      log('Response body (text):', text);
      body = { error: text };
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${JSON.stringify(body)}`);
    }
    
    return body;
  } catch (err) {
    error('Request failed:');
    error('Error message:', err.message);
    error('Stack trace:', err.stack);
    throw err;
  }
}

// Main async function
async function main() {
  try {
    // Test connectivity first
    if (!await testConnectivity()) {
      throw new Error('Failed to resolve application hostname. Please check network connectivity and DNS.');
    }

    // Pre-warm the application with multiple attempts
    log('\n=== Pre-warming Application ===');
    log('Sending initial requests to wake up the application...');
    
    let preWarmSuccess = false;
    
    // Try to pre-warm multiple times
    for (let i = 0; i < 3; i++) {
      try {
        log(`\nPre-warm attempt ${i + 1}/3...`);
        const data = await loggedFetch(config.BASE_URL, {
          method: 'GET',
          timeout: 30000,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        log('Pre-warm request succeeded!');
        preWarmSuccess = true;
        break;
      } catch (err) {
        log(`Pre-warm attempt ${i + 1} failed: ${err.message}`);
      }
      
      if (i < 2) {
        const waitTime = 30000; // 30 seconds between attempts
        log(`Waiting ${waitTime/1000} seconds before next pre-warm attempt...`);
        await sleep(waitTime);
      }
    }

    if (!preWarmSuccess) {
      throw new Error('Failed to pre-warm the application after 3 attempts');
    }
    
    // Give the application a moment to fully initialize
    const warmupTime = 45000; // 45 seconds
    log(`\nWaiting ${warmupTime/1000} seconds for application to warm up...`);
    await sleep(warmupTime);

    // 1. Do the health check
    log('\n=== Health Check ===');
    log('Testing application health...');
    
    const healthData = await loggedFetch(`${config.BASE_URL}/health`, {
      method: 'GET',
      timeout: 30000,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (healthData.status !== 'healthy') {
      throw new Error(`Application reported unhealthy status: ${JSON.stringify(healthData)}`);
    }

    // 2. Then try to fetch entries
    log('\n=== Fetching Entries ===');
    
    // Now try with query parameters
    log('\nFetching entries with date range...');
    const API_URL = `${config.BASE_URL}/api/entries?start=${encodeURIComponent(config.startDate.toISOString())}&end=${encodeURIComponent(config.endDate.toISOString())}`;
    
    const data = await loggedFetch(API_URL, {
      method: 'GET',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!data || !data.entries) {
      throw new Error('API response missing entries array');
    }

    const entries = data.entries;
    log(`Found ${entries.length} entries in API response`);
    
    // Strict filtering of entries to ensure they're in the correct time window
    const validEntries = entries.filter(e => {
        // Ensure we have a timestamp
        if (!e.timestamp) {
            log(`Skipping entry with no timestamp: ${JSON.stringify(e)}`);
            return false;
        }

        const entryTime = dayjs(e.timestamp).utc();
        const isValid = entryTime.isAfter(config.startDate) && entryTime.isBefore(config.endDate);
        
        if (!isValid) {
            log(`Filtered out entry: ${e.item_name} at ${entryTime.format('YYYY-MM-DD HH:mm:ss')} UTC`);
            log(`  - Outside window: ${config.startDate.format('YYYY-MM-DD HH:mm:ss')} to ${config.endDate.format('YYYY-MM-DD HH:mm:ss')} UTC`);
        }
        
        return isValid;
    });

    log(`\nValid entries in time window: ${validEntries.length}`);
    if (validEntries.length === 0) {
        log('No valid entries found in the specified time window');
        process.exit(0);
    }

    validEntries.forEach(e => {
        const entryTime = dayjs(e.timestamp).utc();
        log(`Entry: ${e.employee_name} - ${e.item_name} - ${e.quantity}${e.unit}`);
        log(`  Time: ${entryTime.format('YYYY-MM-DD HH:mm:ss')} UTC`);
        log(`  Raw timestamp: ${e.timestamp}`);
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
    if (config.DROPBOX_TOKEN) {
      // ... Dropbox upload code ...
    } else {
      log('\n⚠️ Skipping Dropbox upload (no token provided)');
      log('CSV content that would have been uploaded:');
      log(csvContent);
    }

    // Initialize Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    // After generating the report content, send via Resend
    const emailData = {
      from: 'onboarding@resend.dev',
      to: process.env.REPORT_EMAIL,
      subject: `Daily Wastage Report - ${config.startDate.format('DD.MM.YYYY')}`,
      html: htmlContent,
      attachments: [
        {
          filename: `wastage-report-${config.startDate.format('YYYY-MM-DD')}.csv`,
          content: Buffer.from(csvContent).toString('base64'),
          type: 'text/csv'
        }
      ]
    };

    try {
      const response = await resend.emails.send(emailData);
      log('Email sent successfully:', response);
    } catch (err) {
      error('Failed to send email:', err);
      process.exit(1);
    }
  } catch (err) {
    // Log the full error for debugging
    error('\n❌ Error running daily report:');
    error('Error message:', err.message);
    if (err.stack) {
      error('Stack trace:', err.stack);
    }
    error('Please check:');
    error('1. The application is running on Railway');
    error('2. The APP_URL is correct:', config.BASE_URL);
    error('3. The application can be accessed from GitHub Actions');
    process.exit(1);
  }
}

// Run the main function with proper error handling
(async () => {
  try {
    await main();
  } catch (err) {
    error('\n❌ Fatal error:', err);
    process.exit(1);
  }
})();
