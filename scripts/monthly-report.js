// monthly-report.js
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

// Add UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set timezone to UTC
dayjs.tz.setDefault('UTC');

// Configure email
const GMAIL_USER = 'thecastlereports@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_EMAIL = process.env.REPORT_EMAIL || 'thecastle.orders@gmail.com';

if (!GMAIL_APP_PASSWORD) {
  console.error('❌ GMAIL_APP_PASSWORD environment variable is required');
  process.exit(1);
}

// Create email transporter with explicit settings
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD
  },
  logger: true,
  debug: true // include SMTP traffic in the logs
});

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

// Calculate time window - for last month's report or specified date
let firstDayLastMonth, lastDayLastMonth;

if (process.env.REPORT_DATE) {
  // If a specific date is provided, use that month
  const reportDate = dayjs.utc(process.env.REPORT_DATE);
  firstDayLastMonth = reportDate.startOf('month');
  lastDayLastMonth = reportDate.endOf('month');
} else {
  // Default to last month
  const now = dayjs().utc();
  firstDayLastMonth = now.subtract(1, 'month').startOf('month');
  lastDayLastMonth = now.subtract(1, 'month').endOf('month');
}

// Print startup information
console.log('\n=== Monthly Report Generation ===');
console.log('Current time (UTC):', config.now.format('YYYY-MM-DD HH:mm:ss'));
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
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333;
            margin: 0;
            padding: 0;
            background: #f5f5f5;
          }
          .container { 
            max-width: 800px; 
            margin: 40px auto;
            padding: 30px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          }
          .header { 
            text-align: center; 
            margin: -30px -30px 40px -30px;
            padding: 40px;
            background: #f8f9fa;
            border-radius: 12px 12px 0 0;
            border-bottom: 1px solid #e1e4e8;
          }
          .header h1 { 
            color: #2c3e50; 
            margin: 0;
            font-size: 32px;
            font-weight: 600;
          }
          .header h2 {
            color: #34495e;
            margin: 15px 0 0 0;
            font-size: 24px;
            font-weight: 500;
          }
          .summary { 
            background: #fff;
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 40px;
            border: 1px solid #e1e4e8;
          }
          .summary p { 
            margin: 15px 0;
            font-size: 16px;
          }
          .cost { 
            color: #e74c3c;
            font-weight: 600;
            font-size: 18px;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 25px 0;
            font-size: 15px;
          }
          th { 
            background: #2c3e50; 
            color: white; 
            padding: 15px 12px;
            text-align: left;
            font-weight: 500;
            border-radius: 4px 4px 0 0;
          }
          td { 
            padding: 12px; 
            border-bottom: 1px solid #eee;
          }
          tr:nth-child(even) { 
            background: #f8f9fa;
          }
          tr:hover {
            background: #f1f3f5;
          }
          .section-title {
            color: #2c3e50;
            margin: 35px 0 20px 0;
            font-size: 20px;
            font-weight: 500;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
          }
          .footer { 
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #eee;
            font-size: 14px;
            color: #666;
            text-align: center;
          }
          .footer p {
            margin: 5px 0;
          }
          @media print {
            body {
              background: white;
            }
            .container {
              box-shadow: none;
              margin: 0;
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>The Castle Berlin</h1>
            <h2>Monthly Wastage Report</h2>
          </div>
          
          <div class="summary">
            <p><strong>Period:</strong> ${firstDayLastMonth.format('DD.MM.YYYY')} - ${lastDayLastMonth.format('DD.MM.YYYY')}</p>
            <p><strong>Total Entries:</strong> ${validEntries.length}</p>
            <p><strong>Total Cost:</strong> <span class="cost">€${totalCost.toFixed(2)}</span></p>
          </div>

          <h3 class="section-title">Summary by Item</h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              ${itemSummary.map(item => `
                <tr>
                  <td>${item.item}</td>
                  <td>${item.qty} ${item.unit}</td>
                  <td>€${item.cost.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h3 class="section-title">Detailed Wastage Report</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
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
                  <td>${dayjs(e.timestamp).utc().format('DD.MM.YYYY')}</td>
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
    console.log('\nSending email report...');
    
    const mailOptions = {
      from: GMAIL_USER,
      to: REPORT_EMAIL,
      subject: `Monthly Wastage Report - ${firstDayLastMonth.format('MMM YYYY')}`,
      html: htmlContent,
      attachments: [
        {
          filename: `wastage-report-${firstDayLastMonth.format('YYYY-MM')}.csv`,
          content: csvContent,
          contentType: 'text/csv'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.response);

  } catch (err) {
    console.error('\n❌ Error generating/sending monthly report:');
    console.error('Error message:', err.message);
    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }
    console.error('Please check:');
    console.error('1. The application is running on Railway');
    console.error('2. The APP_URL is correct:', process.env.APP_URL);
    console.error('3. The GMAIL_APP_PASSWORD is valid');
    console.error('4. The REPORT_EMAIL is correct');
    process.exit(1);
  }
}

// Run the main function
main(); 