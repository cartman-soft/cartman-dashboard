const path = require('path');

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.VERCEL_REGION ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.AWS_EXECUTION_ENV ||
  (typeof __dirname === 'string' && (__dirname.startsWith('/var/task') || __dirname.includes('/var/task'))) ||
  (typeof process.cwd === 'function' && (process.cwd().startsWith('/var/task') || process.cwd().includes('/var/task')))
);
const isDemoMode = process.env.DEMO_MODE === 'true' || isServerless || process.env.NODE_ENV === 'demo';

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
  isReadOnly: isDemoMode || isServerless
};

module.exports = config;
