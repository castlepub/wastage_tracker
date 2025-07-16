// email-report.js
const sgMail = require('@sendgrid/mail');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fetch = require('node-fetch');

// Add UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set timezone to UTC
dayjs.tz.setDefault('UTC');

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const REPORT_EMAIL = process.env.REPORT_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || 'info@thecastleberlin.de';
const DEFAULT_URL = 'https://wastagetracker-production.up.railway.app';

if (!SENDGRID_API_KEY) {
  console.error('❌ SENDGRID_API_KEY environment variable is required');
  process.exit(1);
}

if (!REPORT_EMAIL) {
  console.error('❌ REPORT_EMAIL environment variable is required');
  process.exit(1);
}

sgMail.setApiKey(SENDGRID_API_KEY);

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
          ...(options.headers || {})
        }
      });
      
      if (!res.ok) {
        throw new Error(`API request failed with status ${res.status}`);
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

async function generateReport() {
  try {
    // Calculate time window - for yesterday's report
    const now = dayjs().utc();
    const today6AM = now.startOf('day').add(6, 'hour');
    const yesterday6AM = today6AM.subtract(24, 'hour');
    
    // Always report on the previous day's data
    const startDate = yesterday6AM;
    const endDate = today6AM;

    console.log('\nGenerating report for period:');
    console.log('From:', startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
    console.log('To:  ', endDate.format('YYYY-MM-DD HH:mm'), 'UTC\n');

    // Debug environment
    console.log('Environment variables:');
    console.log('- APP_URL:', process.env.APP_URL || '(not set)');
    console.log('- REPORT_EMAIL:', process.env.REPORT_EMAIL ? '(set)' : '(not set)');
    console.log('- SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? '(set)' : '(not set)');

    // Construct base URL
    let baseUrl = process.env.APP_URL;
    if (!baseUrl || baseUrl.trim() === '') {
      console.log('\nNo APP_URL provided, using default:', DEFAULT_URL);
      baseUrl = DEFAULT_URL;
    }
    
    // Ensure baseUrl has no trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '');
    console.log('Base URL after cleanup:', baseUrl);

    // Construct API URL manually
    const apiUrl = `${baseUrl}/api/entries?start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`;
    console.log('Constructed API URL:', apiUrl);

    // Validate URL
    try {
      const urlObject = new URL(apiUrl);
      console.log('\nURL validation passed:');
      console.log('- Protocol:', urlObject.protocol);
      console.log('- Host:', urlObject.host);
      console.log('- Pathname:', urlObject.pathname);
      console.log('- Search:', urlObject.search);
    } catch (err) {
      console.error('URL validation failed:', err.message);
      throw new Error(`Invalid URL constructed: ${apiUrl}`);
    }

    // Fetch data
    console.log('\nAttempting to fetch data from:', apiUrl);
    const data = await fetchWithRetries(apiUrl);
    const entries = data.entries || [];

    // Filter and validate entries
    const validEntries = entries.filter(e => {
      const entryTime = dayjs(e.timestamp).utc();
      return entryTime.isAfter(startDate) && entryTime.isBefore(endDate);
    });

    // Generate CSV
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

    // Generate HTML summary
    const totalCost = validEntries.reduce((sum, e) => sum + (e.total_cost || 0), 0);
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #1a1a1a; margin-bottom: 10px; }
          .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 30px; }
          .summary p { margin: 10px 0; }
          .cost { color: #d35400; font-weight: bold; }
          .error-section { background: #fee; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .error-section h3 { color: #c0392b; margin-top: 0; }
          .new-items-section { background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .new-items-section h3 { color: #2e7d32; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #2c3e50; color: white; padding: 12px; text-align: left; }
          td { padding: 10px; border-bottom: 1px solid #ddd; }
          tr:nth-child(even) { background: #f9f9f9; }
          .footer { margin-top: 30px; font-size: 0.9em; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>The Castle Berlin</h1>
            <h2>Daily Wastage Report</h2>
          </div>
          
          ${global.newItemLog && global.newItemLog.length > 0 ? `
          <div class="new-items-section">
            <h3>🆕 New Items Added</h3>
            <p>The following items were added and need cost values to be set:</p>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                ${global.newItemLog.map(item => `
                  <tr>
                    <td>${dayjs(item.timestamp).format('HH:mm:ss')}</td>
                    <td>${item.itemName}</td>
                    <td>${item.unit}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <p style="margin-top: 15px; color: #2e7d32;"><strong>Action Required:</strong> Please update the cost values for these items.</p>
          </div>
          ` : ''}
          
          ${global.errorLog && global.errorLog.length > 0 ? `
          <div class="error-section">
            <h3>⚠️ System Errors</h3>
            <p>The following errors occurred in the last 24 hours:</p>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Context</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                ${global.errorLog.map(error => `
                  <tr>
                    <td>${dayjs(error.timestamp).format('HH:mm:ss')}</td>
                    <td>${error.context}</td>
                    <td>${error.error}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}
          
          <div class="summary">
            <p><strong>Period:</strong> ${startDate.format('DD.MM.YYYY HH:mm')} - ${endDate.format('DD.MM.YYYY HH:mm')} UTC</p>
            <p><strong>Total Entries:</strong> ${validEntries.length}</p>
            <p><strong>Total Cost:</strong> <span class="cost">€${totalCost.toFixed(2)}</span></p>
          </div>

          <h3>Summary by Item</h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              ${Object.values(validEntries.reduce((acc, e) => {
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
              }, {})).map(item => `
                <tr>
                  <td>${item.item}</td>
                  <td>${item.qty} ${item.unit}</td>
                  <td>€${item.cost.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h3>Detailed Wastage Report</h3>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Employee</th>
                <th>Item</th>
                <th>Quantity</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${validEntries.sort((a, b) => dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix()).map(e => `
                <tr>
                  <td>${dayjs(e.timestamp).utc().format('HH:mm')}</td>
                  <td>${e.employee_name}</td>
                  <td>${e.item_name}</td>
                  <td>${e.quantity} ${e.unit}</td>
                  <td>${e.reason || 'Not specified'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>A CSV file with detailed entries is attached to this email.</p>
            <p>Generated by The Castle Wastage Tracker</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    const msg = {
      to: REPORT_EMAIL,
      from: FROM_EMAIL,
      subject: `Wastage Report ${startDate.format('DD.MM.YYYY')}`,
      html: htmlContent,
      attachments: [
        {
          content: Buffer.from(csvContent).toString('base64'),
          filename: `wastage-${startDate.format('YYYY-MM-DD')}.csv`,
          type: 'text/csv',
          disposition: 'attachment'
        }
      ]
    };

    await sgMail.send(msg);
    console.log('✅ Report sent successfully');

  } catch (err) {
    console.error('❌ Failed to send report:', err.message);
    process.exit(1);
  }
}

// Run the report
generateReport(); 
