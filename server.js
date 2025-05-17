// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const seedCosts = require('./scripts/seedCosts');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Serve static front-end
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'castle-wastage-secret',
  resave: true,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true only if you're using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  console.log('Auth check:', {
    sessionExists: !!req.session,
    isAuthenticated: req.session.isAuthenticated
  });
  
  if (req.session.isAuthenticated) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Login page route
app.get('/login', (req, res) => {
  if (req.session.isAuthenticated) {
    return res.redirect('/entries');
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Login - The Castle Berlin</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 20px;
          background: #f5f5f5;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .login-container {
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          width: 100%;
          max-width: 400px;
        }
        h1 {
          color: #2c3e50;
          text-align: center;
          margin-bottom: 30px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          color: #666;
        }
        input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-sizing: border-box;
        }
        button {
          width: 100%;
          padding: 10px;
          background: #2c3e50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background: #34495e;
        }
        .error {
          color: #e74c3c;
          text-align: center;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h1>The Castle Berlin</h1>
        ${req.query.error ? '<p class="error">Invalid username or password</p>' : ''}
        <form method="POST" action="/login">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required>
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
          </div>
          <button type="submit">Login</button>
        </form>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// Login POST handler
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Get credentials from environment variables
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'castle123';
  
  console.log('Login attempt:', {
    providedUsername: username,
    expectedUsername: ADMIN_USERNAME,
    usernameMatch: username === ADMIN_USERNAME,
    passwordMatch: password === ADMIN_PASSWORD,
    envVarsPresent: {
      ADMIN_USERNAME: !!process.env.ADMIN_USERNAME,
      ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD
    }
  });
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    console.log('Login successful, setting session');
    req.session.isAuthenticated = true;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect('/login?error=1');
      }
      console.log('Session saved, redirecting to entries');
      res.redirect('/entries');
    });
  } else {
    console.log('Login failed, redirecting to login with error');
    res.redirect('/login?error=1');
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Validate database URL
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Connect to Postgres with connection timeout
const db = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000
});

// Initialize database and start server
async function initialize() {
  try {
    // 1. Test database connection
    const client = await db.connect();
    console.log('✅ Database connection successful');
    client.release();

    // 2. Ensure tables exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS wastage_entries (
        id SERIAL PRIMARY KEY,
        employee_name TEXT NOT NULL,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        reason TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ wastage_entries table ready');

    // 3. Seed costs data
    await seedCosts(db);
    
    // 4. Start server
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`✅ Server listening on port ${port}`));
  } catch (err) {
    console.error('Initialization failed:', err);
    process.exit(1);
  }
}

// Input validation middleware
const validateWastageEntry = (req, res, next) => {
  const { employeeName, itemName, quantity, unit, reason } = req.body;
  
  if (!employeeName?.trim() || !itemName?.trim() || !quantity || !unit?.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }

  if (typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Quantity must be a positive number'
    });
  }

  next();
};

// POST /api/entry — log a wastage entry
app.post('/api/entry', validateWastageEntry, async (req, res) => {
  const { employeeName, itemName, quantity, unit, reason } = req.body;
  
  try {
    // First check if item exists
    const itemCheck = await db.query(
      'SELECT unit FROM item_costs WHERE item_name = $1',
      [itemName]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid item name'
      });
    }

    // If validation passes, insert the entry
    await db.query(
      `INSERT INTO wastage_entries(employee_name, item_name, quantity, unit, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [employeeName, itemName, quantity, unit, reason || null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error logging wastage:', err);
    res.status(500).json({ success: false, error: 'Failed to log wastage' });
  }
});

// GET /api/items — for autocomplete
app.get('/api/items', async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT item_name AS name, unit AS defaultUnit FROM item_costs ORDER BY item_name'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching items:', err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET /api/entries — wrapped in { entries: [...] }
app.get('/api/entries', async (req, res) => {
  try {
    const { start, end } = req.query;
    console.log('\n=== Entries Request Debug ===');
    console.log('Start date:', start);
    console.log('End date:', end);

    let query = `
      SELECT 
        w.*,
        ic.unit_cost,
        (w.quantity * ic.unit_cost) as total_cost
      FROM wastage_entries w
      LEFT JOIN item_costs ic ON w.item_name = ic.item_name
    `;

    const params = [];
    
    // Only add WHERE clause if both start and end dates are provided
    if (start && end) {
      query += `
        WHERE w.timestamp >= $1::timestamptz
        AND w.timestamp < $2::timestamptz
      `;
      params.push(start, end);
    }

    // Always order by timestamp
    query += ` ORDER BY w.timestamp DESC`;
    
    const { rows } = await db.query(query, params);
    res.json({ entries: rows });
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Protect the entries route
app.get('/entries', requireAuth, async (req, res) => {
  try {
    const { start, end } = req.query;
    
    let query = `
      SELECT 
        w.*,
        ic.unit_cost,
        (w.quantity * ic.unit_cost) as total_cost
      FROM wastage_entries w
      LEFT JOIN item_costs ic ON w.item_name = ic.item_name
      ORDER BY w.timestamp DESC
    `;

    const { rows } = await db.query(query);

    // HTML template with modern styling
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>The Castle Berlin - Wastage Entries</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
          }
          h1 {
            color: #2c3e50;
            margin: 0;
          }
          .logout-btn {
            padding: 8px 16px;
            background: #e74c3c;
            color: white;
            text-decoration: none;
            border-radius: 4px;
          }
          .logout-btn:hover {
            background: #c0392b;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            background: white;
          }
          th {
            background: #2c3e50;
            color: white;
            padding: 12px;
            text-align: left;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #ddd;
          }
          tr:nth-child(even) {
            background: #f9f9f9;
          }
          .timestamp {
            white-space: nowrap;
          }
          .cost {
            text-align: right;
          }
          .reason {
            color: #666;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>The Castle Berlin - Wastage Entries</h1>
            <a href="/logout" class="logout-btn">Logout</a>
          </div>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Employee</th>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Reason</th>
                <th>Cost (€)</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(entry => `
                <tr>
                  <td class="timestamp">${new Date(entry.timestamp).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                  <td>${entry.employee_name}</td>
                  <td>${entry.item_name}</td>
                  <td>${entry.quantity}</td>
                  <td>${entry.unit}</td>
                  <td class="reason">${entry.reason || '-'}</td>
                  <td class="cost">${entry.total_cost ? entry.total_cost.toFixed(2) : '0.00'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).send('Failed to fetch entries');
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const client = await db.connect();
    client.release();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

// Health check
app.get('/', (_req, res) => res.send('OK'));

// Add error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Don't exit the process, just log the error
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  db.end(() => {
    console.log('Database connection closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  db.end(() => {
    console.log('Database connection closed.');
    process.exit(0);
  });
});

// Add export endpoint with token auth
app.get('/api/export-entries', async (req, res) => {
  console.log('Export endpoint called');
  
  const token = req.headers.authorization?.split(' ')[1];
  console.log('Received token:', token ? '(present)' : '(missing)');
  
  if (!token || token !== process.env.EXPORT_TOKEN) {
    console.log('Invalid or missing token');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Fetching entries from database...');
    const entries = await db.query(
      'SELECT * FROM wastage_entries ORDER BY timestamp DESC'
    );
    
    console.log(`Found ${entries.rows.length} entries`);
    
    // Ensure we're sending a valid JSON array
    const sanitizedEntries = entries.rows.map(entry => ({
      id: entry.id,
      employee_name: entry.employee_name,
      item_name: entry.item_name,
      quantity: parseFloat(entry.quantity),
      unit: entry.unit,
      reason: entry.reason,
      timestamp: entry.timestamp,
      total_cost: parseFloat(entry.total_cost || 0)
    }));

    console.log('Sending response...');
    res.json(sanitizedEntries);
  } catch (err) {
    console.error('Export failed:', err);
    res.status(500).json({ 
      error: 'Failed to export entries',
      details: err.message
    });
  }
});

// Initialize the application
initialize().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
