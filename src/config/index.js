const path = require('path');

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const isDemoMode = process.env.DEMO_MODE === 'true' || isVercel || process.env.NODE_ENV === 'demo';

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'cartman-secure-jwt-secret-key-production-change-this',
  sessionTimeoutHours: parseInt(process.env.SESSION_TIMEOUT_HOURS || '12', 10),
  companyName: process.env.COMPANY_NAME || 'Cartman',
  currency: 'INR',
  currencySymbol: '₹',
  syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '15', 10),
  dbPath: path.resolve(__dirname, '../../data/cartman_db.json'),
  uploadDir: path.resolve(__dirname, '../../uploads'),
  templatesDir: path.resolve(__dirname, '../../public/templates'),
  isDemoMode,
  isReadOnly: isDemoMode || isVercel
};

module.exports = config;
