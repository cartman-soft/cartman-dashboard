/**
 * Cartman Multi-Marketplace Dashboard Server
 * Main application entrypoint.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { db } = require('./db');
const { seedDatabase } = require('./db/seed');
const { syncScheduler } = require('./integrations/syncScheduler');

// Routes
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const accountRoutes = require('./routes/accountRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reconciliationRoutes = require('./routes/reconciliationRoutes');
const bankRoutes = require('./routes/bankRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const firebaseRoutes = require('./routes/firebaseRoutes');
const salesReportRoutes = require('./routes/salesReportRoutes');

const app = express();

// Initialize database with initial seeds if empty
try {
  seedDatabase();
} catch (e) {
  console.warn('[SEED INIT]', e.message);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Assets (strictly deny serving any dotfiles like .env from public)
app.use(express.static(path.resolve(__dirname, '../public'), {
  dotfiles: 'deny'
}));

// API Routes (Mounted under /api/* and root aliases for proxy/rewrite compatibility)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/firebase', firebaseRoutes);
app.use('/api/sales-report', salesReportRoutes);

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Cartman Dashboard API',
    version: '1.0.0'
  });
});

// Public Demo Status Check
app.get('/api/status', (req, res) => {
  res.json({
    status: 'healthy',
    isDemoMode: Boolean(config.isDemoMode),
    isReadOnly: Boolean(config.isReadOnly),
    service: 'Cartman Dashboard API',
    version: '1.0.0'
  });
});

// Helper to serve index.html with graceful fallback
function serveIndex(req, res) {
  const candidates = [
    path.resolve(__dirname, '../public/index.html'),
    path.resolve(process.cwd(), 'public/index.html')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return res.sendFile(candidate, err => {
        if (err && !res.headersSent) {
          res.status(200).send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Cartman Dashboard</title></head><body><h1>Cartman Dashboard</h1><p>Authentication Required.</p></body></html>');
        }
      });
    }
  }
  res.status(200).send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Cartman Dashboard</title></head><body><h1>Cartman Dashboard</h1><p>Authentication Required.</p></body></html>');
}

// Root Endpoint - Explicitly serve public/index.html
app.get('/', serveIndex);

// Single Page Application Fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return next();
  }
  serveIndex(req, res);
});

// Explicit JSON 404 handler for API routes
app.all(['/api/*', '/auth/*'], (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error occurred.'
  });
});

// Safe masking helpers for logs (never leak secrets, passwords, or full API keys)
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[NOT CONFIGURED]';
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '[INVALID EMAIL]';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2
    ? `${name.charAt(0)}***`
    : `${name.substring(0, 2)}***${name.charAt(name.length - 1)}`;
  return `${maskedName}@${domain}`;
}

function maskKey(key) {
  if (!key || typeof key !== 'string') return '[NOT CONFIGURED]';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '[CONFIGURED]';
  return `${trimmed.substring(0, 5)}...${trimmed.substring(trimmed.length - 3)}`;
}

// Start Server Function
function startServer(port = config.port) {

  // Start background sync scheduler only when not in demo or Vercel mode
  if (!config.isDemoMode && !process.env.VERCEL) {
    syncScheduler.start();
  } else {
    console.log('[SYNC] Background sync scheduler disabled in demo / serverless mode.');
  }

  const server = app.listen(port, () => {
    const ownerEmailStatus = config.dashboardOwnerEmail
      ? maskEmail(config.dashboardOwnerEmail)
      : '[NOT CONFIGURED - Set DASHBOARD_OWNER_EMAIL in .env]';

    const resendStatus = config.resendApiKey
      ? `Resend API (${maskKey(config.resendApiKey)}) [Live Delivery Ready]`
      : (config.nodeEnv === 'production'
          ? '[NOT CONFIGURED - Real emails disabled]'
          : 'Dev Mock (OTPs printed to server terminal)');

    const redisStatus = config.upstashRedisUrl
      ? 'Upstash Redis / Vercel KV (Distributed Store Active)'
      : 'In-Memory (Single Instance)';

    console.log(`=======================================================`);
    console.log(`  CARTMAN DASHBOARD SERVER RUNNING AT http://localhost:${port}`);
    console.log(`  Environment:          ${config.nodeEnv}`);
    console.log(`  Dashboard Owner:      ${config.dashboardUsername}`);
    console.log(`  Owner Email:          ${ownerEmailStatus}`);
    console.log(`  Email Delivery:       ${resendStatus}`);
    console.log(`  Session/OTP Store:    ${redisStatus}`);
    console.log(`  Setup command:        npm run setup:auth`);
    console.log(`=======================================================`);

    if (!config.dashboardOwnerEmail) {
      console.warn(`[CONFIG WARNING] DASHBOARD_OWNER_EMAIL is missing from root .env.`);
      console.warn(`  -> Passwordless Email OTP login requires DASHBOARD_OWNER_EMAIL to be configured.`);
    }
  });

  return server;
}

if (require.main === module) {
  startServer();
}

app.app = app;
app.startServer = startServer;

module.exports = app;
