const path = require('path');
const fs = require('fs');

// Consistently load root .env file from project root directory
// NOTE: .env.example is strictly a template and is never loaded as active configuration.
function loadRootEnv() {
  try {
    const projectRoot = path.resolve(__dirname, '../..');
    const rootEnvPath = path.resolve(projectRoot, '.env');
    if (fs.existsSync(rootEnvPath)) {
      const content = fs.readFileSync(rootEnvPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    // Ignore in restricted environments
  }
}

loadRootEnv();

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

const isDemoMode = process.env.DEMO_MODE === 'true';

// Configured Dashboard Owner Credentials & Email OTP
const dashboardUsername = (process.env.DASHBOARD_USERNAME || process.env.ADMIN_USERNAME || 'admin').trim();
// Strict Dashboard Owner Email: Loaded only from DASHBOARD_OWNER_EMAIL or OWNER_EMAIL.
// Never silently falls back to dummy owner@cartman.internal.
const rawOwnerEmail = process.env.DASHBOARD_OWNER_EMAIL || process.env.OWNER_EMAIL;
const dashboardOwnerEmail = rawOwnerEmail ? rawOwnerEmail.trim().toLowerCase() : '';

let dashboardPasswordHash = process.env.DASHBOARD_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH || '';
const rawPassword = process.env.DASHBOARD_PASSWORD || process.env.ADMIN_PASSWORD;

if (!dashboardPasswordHash && rawPassword) {
  const bcrypt = require('bcryptjs');
  dashboardPasswordHash = bcrypt.hashSync(rawPassword.trim(), 10);
}

// If someone provided a plain-text password in DASHBOARD_PASSWORD_HASH (doesn't start with $2)
if (dashboardPasswordHash && !dashboardPasswordHash.startsWith('$2')) {
  const bcrypt = require('bcryptjs');
  dashboardPasswordHash = bcrypt.hashSync(dashboardPasswordHash.trim(), 10);
}

// Fallback development hash for initial local setup if neither hash nor password provided
if (!dashboardPasswordHash) {
  // Pre-computed salted bcrypt hash for 'CartmanAdmin2026!'
  dashboardPasswordHash = '$2b$10$UEw2NGtQkms99MidqvLYnuGIF5MdtZHbGbx7ewNP1UwrUDYtGzOi.';
}

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
  dashboardUsername,
  dashboardOwnerEmail,
  dashboardPasswordHash,
  dashboardFullName: process.env.DASHBOARD_FULL_NAME || 'Administrator',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'Cartman Dashboard <onboarding@resend.dev>',
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '3', 10),
  otpRateLimitMinutes: parseInt(process.env.OTP_RATE_LIMIT_MINUTES || '10', 10),
  isDemoMode,
  isReadOnly: isDemoMode || isServerless,
  loadRootEnv
};

module.exports = config;
