// monthly-report.js
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

// Helper function to format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
}

async function generateMonthlyReport() {
  try {
    // Calculate time window for the previous month
    const now = dayjs().utc();
    const startDate = now.subtract(1, 'month').startOf('month').add(6, 'hour');
    const endDate = now.startOf('month').add(6, 'hour');

    console.log('\nGenerating monthly report for period:');
    console.log('From:', startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
    console.log('To:  ', endDate.format('YYYY-MM-DD HH:mm'), 'UTC\n');

    // Construct base URL with thorough cleaning
    let baseUrl = process.env.APP_URL;
    if (!baseUrl || baseUrl.trim() === '') {
      console.log('\nNo APP_URL provided, using default:', DEFAULT_URL);
      baseUrl = DEFAULT_URL;
    } else {
      // Clean the URL: remove newlines, trim whitespace, ensure https://
      baseUrl = baseUrl
        .replace(/[\n\r]+/g, '') // Remove newlines
        .trim() // Remove leading/trailing whitespace
        .replace(/\/+$/, ''); // Remove trailing slashes
      
      if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = 'https://' + baseUrl;
      }
    }
    
    console.log('Base URL after cleanup:', baseUrl);

    // Construct API URL
    const apiUrl = new URL('/api/entries', baseUrl);
    apiUrl.searchParams.append('start', startDate.toISOString());
    apiUrl.searchParams.append('end', endDate.toISOString());
    
    console.log('Full API URL:', apiUrl.toString());

    // Fetch data
    const data = await fetchWithRetries(apiUrl.toString());
    const entries = data.entries || [];

    // Filter and validate entries
    const validEntries = entries.filter(e => {
      const entryTime = dayjs(e.timestamp).utc();
      return entryTime.isAfter(startDate) && entryTime.isBefore(endDate);
    });

    // Generate monthly statistics
    const totalCost = validEntries.reduce((sum, e) => sum + (e.total_cost || 0), 0);
    const dailyTotals = validEntries.reduce((acc, e) => {
      const day = dayjs(e.timestamp).utc().format('YYYY-MM-DD');
      if (!acc[day]) {
        acc[day] = { cost: 0, count: 0 };
      }
      acc[day].cost += (e.total_cost || 0);
      acc[day].count += 1;
      return acc;
    }, {});

    const averageDailyCost = totalCost / Object.keys(dailyTotals).length || 0;
    const highestDailyCost = Math.max(...Object.values(dailyTotals).map(d => d.cost));
    const busyDays = Object.entries(dailyTotals)
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 5);

    // Generate CSV
    const headers = ['Date', 'Employee', 'Item', 'Qty', 'Unit', 'Reason', 'Time (UTC)', 'Cost (€)'];
    const rows = validEntries.map(e => [
      dayjs(e.timestamp).utc().format('DD.MM.YYYY'),
      e.employee_name,
      e.item_name,
      e.quantity,
      e.unit,
      e.reason || '',
      dayjs(e.timestamp).utc().format('HH:mm:ss'),
      e.total_cost?.toFixed(2) || '0.00'
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    // Generate HTML summary with monthly statistics
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
          .stats { margin: 20px 0; padding: 20px; background: #fff; border: 1px solid #ddd; border-radius: 5px; }
          .chart { margin: 20px 0; }
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
            <h2>Monthly Wastage Report</h2>
          </div>
          
          <div class="summary">
            <p><strong>Period:</strong> ${startDate.format('DD.MM.YYYY')} - ${endDate.format('DD.MM.YYYY')}</p>
            <p><strong>Total Entries:</strong> ${validEntries.length}</p>
            <p><strong>Total Cost:</strong> <span class="cost">${formatCurrency(totalCost)}</span></p>
          </div>

          <div class="stats">
            <h3>Monthly Statistics</h3>
            <p><strong>Average Daily Cost:</strong> ${formatCurrency(averageDailyCost)}</p>
            <p><strong>Highest Daily Cost:</strong> ${formatCurrency(highestDailyCost)}</p>
            <p><strong>Days with Entries:</strong> ${Object.keys(dailyTotals).length}</p>
          </div>

          <div class="stats">
            <h3>Top 5 Highest Cost Days</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total Cost</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                ${busyDays.map(([day, data]) => `
                  <tr>
                    <td>${dayjs(day).format('DD.MM.YYYY')}</td>
                    <td>${formatCurrency(data.cost)}</td>
                    <td>${data.count}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <h3>Summary by Item</h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Total Quantity</th>
                <th>Total Cost</th>
                <th>Occurrences</th>
              </tr>
            </thead>
            <tbody>
              ${Object.values(validEntries.reduce((acc, e) => {
                if (!acc[e.item_name]) {
                  acc[e.item_name] = { 
                    item: e.item_name, 
                    qty: 0, 
                    cost: 0,
                    count: 0,
                    unit: e.unit 
                  };
                }
                acc[e.item_name].qty += e.quantity;
                acc[e.item_name].cost += (e.total_cost || 0);
                acc[e.item_name].count += 1;
                return acc;
              }, {}))
              .sort((a, b) => b.cost - a.cost)
              .map(item => `
                <tr>
                  <td>${item.item}</td>
                  <td>${item.qty} ${item.unit}</td>
                  <td>${formatCurrency(item.cost)}</td>
                  <td>${item.count}</td>
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
      subject: `Monthly Wastage Report - ${startDate.format('MMMM YYYY')}`,
      html: htmlContent,
      attachments: [
        {
          content: Buffer.from(csvContent).toString('base64'),
          filename: `wastage-${startDate.format('YYYY-MM')}.csv`,
          type: 'text/csv',
          disposition: 'attachment'
        }
      ]
    };

    await sgMail.send(msg);
    console.log('✅ Monthly report sent successfully');

  } catch (err) {
    console.error('❌ Failed to send monthly report:', err.message);
    process.exit(1);
  }
}

// Run the report
generateMonthlyReport(); 