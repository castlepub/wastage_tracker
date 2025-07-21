// daily-reports.cjs
const nodemailer = require('nodemailer');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fetch = require('node-fetch');

// Add UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set timezone to UTC
dayjs.tz.setDefault('UTC');

// Configure email
const GMAIL_USER = 'thecastlereports@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_EMAIL = process.env.REPORT_EMAIL || 'thecastle.orders@gmail.com';
const DEFAULT_URL = 'https://wastagetracker-production.up.railway.app';

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
    // Calculate time window based on input date or default to yesterday
    let startDate;
    if (process.env.REPORT_DATE) {
      // If a date is provided, use it
      startDate = dayjs.utc(process.env.REPORT_DATE).startOf('day').add(6, 'hour');
    } else {
      // Default to yesterday 6 AM UTC
      const now = dayjs().utc();
      const today6AM = now.startOf('day').add(6, 'hour');
      startDate = now.isBefore(today6AM) 
        ? today6AM.subtract(24, 'hour')
        : today6AM;
    }
    
    const endDate = startDate.add(24, 'hour');

    console.log('\nGenerating report for period:');
    console.log('From:', startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
    console.log('To:  ', endDate.format('YYYY-MM-DD HH:mm'), 'UTC\n');

    // Debug environment
    console.log('Environment variables:');
    console.log('- APP_URL:', process.env.APP_URL || '(not set)');
    console.log('- REPORT_EMAIL:', process.env.REPORT_EMAIL ? '(set)' : '(not set)');
    console.log('- GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? '(set)' : '(not set)');
    console.log('- REPORT_DATE:', process.env.REPORT_DATE || '(not set, using yesterday)');

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
            margin-bottom: 40px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .logo {
            max-width: 200px;
            height: auto;
            margin-bottom: 30px;
          }
          .header h1 { 
            color: #2c3e50; 
            margin: 0;
            font-size: 28px;
            font-weight: 600;
          }
          .header h2 {
            color: #34495e;
            margin: 10px 0 0 0;
            font-size: 22px;
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
          .rtl {
            direction: rtl;
            text-align: right;
          }
          .ltr {
            direction: ltr;
            text-align: left;
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
            <h2>Daily Wastage Report / דוח בזבוז יומי</h2>
          </div>
          
          <div class="summary">
            <p><strong>Period / תקופה:</strong> ${startDate.format('DD.MM.YYYY HH:mm')} - ${endDate.format('DD.MM.YYYY HH:mm')} UTC</p>
            <p><strong>Total Entries / סך הכל רשומות:</strong> ${validEntries.length}</p>
            <p><strong>Total Cost / עלות כוללת:</strong> <span class="cost">€${totalCost.toFixed(2)}</span></p>
          </div>

          <h3 class="section-title">Summary by Item / סיכום לפי פריט</h3>
          <table>
            <thead>
              <tr>
                <th>Item / פריט</th>
                <th>Quantity / כמות</th>
                <th>Total Cost / עלות כוללת</th>
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

          <h3 class="section-title">Detailed Wastage Report / דוח בזבוז מפורט</h3>
          <table>
            <thead>
              <tr>
                <th>Time / זמן</th>
                <th>Employee / עובד</th>
                <th>Item / פריט</th>
                <th>Quantity / כמות</th>
                <th>Reason / סיבה</th>
              </tr>
            </thead>
            <tbody>
              ${validEntries.sort((a, b) => dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix()).map(e => `
                <tr>
                  <td>${dayjs(e.timestamp).utc().format('HH:mm')}</td>
                  <td>${e.employee_name}</td>
                  <td>${e.item_name}</td>
                  <td>${e.quantity} ${e.unit}</td>
                  <td>${e.reason || 'Not specified / לא צוין'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>A CSV file with detailed entries is attached to this email / קובץ CSV עם רשומות מפורטות מצורף לדוא"ל זה</p>
            <p>Generated by The Castle Wastage Tracker / נוצר על ידי מערכת מעקב בזבוז של The Castle</p>
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
      subject: `Daily Wastage Report - ${startDate.format('DD.MM.YYYY')}`,
      html: htmlContent,
      attachments: [
        {
          filename: `wastage-report-${startDate.format('YYYY-MM-DD')}.csv`,
          content: csvContent,
          contentType: 'text/csv'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.response);

  } catch (err) {
    console.error('\n❌ Error generating/sending report:');
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

// Run the report generation
generateReport();
