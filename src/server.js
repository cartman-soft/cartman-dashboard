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

// Static Assets
app.use(express.static(path.resolve(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
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

// Single Page Application Fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  const indexPath = path.resolve(__dirname, '../public/index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(200).send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Cartman Dashboard</title></head><body><h1>Cartman Dashboard</h1><p>Public Demo Mode Active.</p></body></html>');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error occurred.'
  });
});

// Start Server Function
function startServer(port = config.port) {

  // Start background sync scheduler only when not in demo or Vercel mode
  if (!config.isDemoMode && !process.env.VERCEL) {
    syncScheduler.start();
  } else {
    console.log('[SYNC] Background sync scheduler disabled in demo / serverless mode.');
  }

  const server = app.listen(port, () => {
    console.log(`=======================================================`);
    console.log(`  CARTMAN DASHBOARD SERVER RUNNING AT http://localhost:${port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Default Logins:`);
    console.log(`    Admin:    admin@cartman.com    (CartmanAdmin2026!)`);
    console.log(`    Accounts: accounts@cartman.com (CartmanAcc2026!)`);
    console.log(`    Staff:    staff@cartman.com    (CartmanStaff2026!)`);
    console.log(`=======================================================`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
