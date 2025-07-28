// weekly-report.js - One-time weekly report for last week
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
  console.error('Please set it in your environment or run with:');
  console.error('GMAIL_APP_PASSWORD=your_password node scripts/weekly-report.js');
  process.exit(1);
}

// Create email transporter
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
  debug: true
});

// Helper function to fetch with retries
async function fetchWithRetries(url, options = {}, maxRetries = 3, initialDelay = 2000) {
  let lastError;
  let delay = initialDelay;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`\nAttempt ${i + 1}/${maxRetries} to fetch data...`);
      
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
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }
  
  throw lastError;
}

async function generateWeeklyReport() {
  try {
    // Calculate target week's date range
    const today = dayjs().utc();
    const weeksBack = parseInt(process.env.WEEKS_BACK || '0') + 1; // +1 because 0 = last week
    
    // Find target Monday (start of target week)
    const targetMonday = today.subtract(weeksBack, 'week').startOf('week').add(1, 'day'); // Monday of target week
    const targetSunday = targetMonday.add(6, 'days').endOf('day'); // Sunday of target week
    
    // Adjust to 6 AM boundaries for consistency with daily reports
    const startDate = targetMonday.startOf('day').add(6, 'hour');
    const endDate = targetSunday.add(1, 'day').startOf('day').add(6, 'hour');

    console.log(`\n📅 Generating weekly report for ${weeksBack === 1 ? 'last week' : `${weeksBack} weeks ago`}:`);
    console.log('From:', startDate.format('YYYY-MM-DD HH:mm'), 'UTC');
    console.log('To:  ', endDate.format('YYYY-MM-DD HH:mm'), 'UTC');
    console.log('Week:', targetMonday.format('DD.MM') + ' - ' + targetSunday.format('DD.MM.YYYY'));

    // Construct API URL
    let baseUrl = process.env.APP_URL || DEFAULT_URL;
    baseUrl = baseUrl.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/api/entries?start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`;
    
    console.log('\n🔍 Fetching data from:', apiUrl);

    // Fetch data
    const data = await fetchWithRetries(apiUrl);
    const entries = data.entries || [];

    console.log(`\n✅ Found ${entries.length} entries for last week`);

    if (entries.length === 0) {
      console.log('⚠️  No entries found for last week. Sending empty report notification.');
    }

    // Group entries by day
    const entriesByDay = {};
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Initialize all days
    for (let i = 0; i < 7; i++) {
      const day = targetMonday.add(i, 'day');
      const dayKey = day.format('YYYY-MM-DD');
      entriesByDay[dayKey] = {
        date: day,
        dayName: dayNames[i],
        entries: [],
        totalCost: 0
      };
    }

    // Group entries by day
    entries.forEach(entry => {
      const entryDate = dayjs(entry.timestamp).utc();
      const dayKey = entryDate.format('YYYY-MM-DD');
      
      if (entriesByDay[dayKey]) {
        entriesByDay[dayKey].entries.push(entry);
        entriesByDay[dayKey].totalCost += (entry.total_cost || 0);
      }
    });

    // Calculate totals
    const totalCost = entries.reduce((sum, e) => sum + (e.total_cost || 0), 0);
    
    // Generate item summary
    const itemSummary = Object.values(entries.reduce((acc, e) => {
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
    }, {})).sort((a, b) => b.cost - a.cost); // Sort by cost descending

    // Generate CSV
    const headers = ['Day', 'Date', 'Time', 'Employee', 'Item', 'Qty', 'Unit', 'Reason', 'Cost (€)'];
    const rows = entries.map(e => [
      dayjs(e.timestamp).format('dddd'),
      dayjs(e.timestamp).format('DD.MM.YYYY'),
      dayjs(e.timestamp).utc().format('HH:mm'),
      e.employee_name,
      e.item_name,
      e.quantity,
      e.unit,
      e.reason || '',
      e.total_cost?.toFixed(2) || '0.00'
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    // Generate HTML content
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
            max-width: 900px; 
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
          .section-title {
            color: #2c3e50;
            margin: 35px 0 20px 0;
            font-size: 20px;
            font-weight: 500;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
          }
          .day-section {
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #3498db;
          }
          .day-header {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 15px;
          }
          .no-entries {
            color: #7f8c8d;
            font-style: italic;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 25px 0;
            font-size: 14px;
          }
          th { 
            background: #2c3e50; 
            color: white; 
            padding: 12px 8px;
            text-align: left;
            font-weight: 500;
          }
          td { 
            padding: 10px 8px; 
            border-bottom: 1px solid #eee;
          }
          tr:nth-child(even) { 
            background: #f8f9fa;
          }
          tr:hover {
            background: #f1f3f5;
          }
          .footer { 
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #eee;
            font-size: 14px;
            color: #666;
            text-align: center;
          }
          .cost-highlight {
            background: #fff3cd;
            padding: 2px 6px;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>The Castle Berlin</h1>
            <h2>Weekly Wastage Report</h2>
                         <p>Week of ${targetMonday.format('DD.MM')} - ${targetSunday.format('DD.MM.YYYY')}</p>
          </div>
          
          <div class="summary">
            <p><strong>Period:</strong> ${startDate.format('DD.MM.YYYY HH:mm')} - ${endDate.format('DD.MM.YYYY HH:mm')} UTC</p>
            <p><strong>Total Entries:</strong> ${entries.length}</p>
            <p><strong>Total Cost:</strong> <span class="cost">€${totalCost.toFixed(2)}</span></p>
            <p><strong>Daily Average:</strong> €${(totalCost / 7).toFixed(2)}</p>
          </div>

          <h3 class="section-title">Daily Breakdown</h3>
          ${Object.values(entriesByDay).map(day => `
            <div class="day-section">
              <div class="day-header">
                ${day.dayName}, ${day.date.format('DD.MM.YYYY')} 
                <span class="cost-highlight">€${day.totalCost.toFixed(2)}</span>
                (${day.entries.length} entries)
              </div>
              ${day.entries.length === 0 ? 
                '<p class="no-entries">No wastage entries</p>' :
                day.entries.map(e => `
                  <div style="margin: 8px 0; padding: 8px; background: white; border-radius: 4px;">
                    <strong>${dayjs(e.timestamp).format('HH:mm')}</strong> - 
                    ${e.employee_name} - 
                    ${e.item_name} 
                    (${e.quantity} ${e.unit}) - 
                    €${(e.total_cost || 0).toFixed(2)}
                    ${e.reason ? ` - <em>${e.reason}</em>` : ''}
                  </div>
                `).join('')
              }
            </div>
          `).join('')}

          <h3 class="section-title">Summary by Item</h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Total Quantity</th>
                <th>Total Cost</th>
                <th>Frequency</th>
              </tr>
            </thead>
            <tbody>
              ${itemSummary.map(item => `
                <tr>
                  <td>${item.item}</td>
                  <td>${item.qty} ${item.unit}</td>
                  <td>€${item.cost.toFixed(2)}</td>
                  <td>${entries.filter(e => e.item_name === item.item).length}x</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>A CSV file with detailed entries is attached to this email</p>
            <p>Generated by The Castle Wastage Tracker - Weekly Report</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    console.log('\n📧 Sending weekly report email...');
    
    const mailOptions = {
      from: GMAIL_USER,
      to: REPORT_EMAIL,
      subject: `Weekly Wastage Report - Week of ${targetMonday.format('DD.MM')} - ${targetSunday.format('DD.MM.YYYY')}`,
      html: htmlContent,
      attachments: [
        {
          filename: `weekly-wastage-report-${targetMonday.format('YYYY-MM-DD')}.csv`,
          content: csvContent,
          contentType: 'text/csv'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Weekly report email sent successfully:', info.response);
    console.log('\n📊 Report Summary:');
    console.log(`- Period: ${targetMonday.format('DD.MM')} - ${targetSunday.format('DD.MM.YYYY')}`);
    console.log(`- Total Entries: ${entries.length}`);
    console.log(`- Total Cost: €${totalCost.toFixed(2)}`);
    console.log(`- Daily Average: €${(totalCost / 7).toFixed(2)}`);

  } catch (err) {
    console.error('\n❌ Error generating/sending weekly report:');
    console.error('Error message:', err.message);
    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }
    process.exit(1);
  }
}

// Run the weekly report generation
console.log('📈 Starting weekly report generation for last week...');
generateWeeklyReport(); 