/**
 * Cartman Email Delivery Service
 * Sends secure 6-digit authentication OTPs via Resend API or dev fallback.
 */

const https = require('https');
const config = require('../config');

let lastDevOtp = null;

/**
 * Validates and parses sender string for Resend API.
 * Resend strictly requires either:
 * - "email@domain.com"
 * - "Display Name <email@domain.com>"
 */
function parseSender(fromStr) {
  if (!fromStr || typeof fromStr !== 'string' || !fromStr.trim()) {
    throw new Error('EMAIL_FROM is required. Please set EMAIL_FROM in the root .env file (e.g. "Cartman Dashboard <onboarding@resend.dev>").');
  }

  const trimmed = fromStr.trim();
  const withNameMatch = trimmed.match(/^([^<]+)<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/);
  if (withNameMatch) {
    const displayName = withNameMatch[1].trim();
    const address = withNameMatch[2].trim().toLowerCase();
    if (!displayName) {
      throw new Error(`Invalid EMAIL_FROM format: "${fromStr}". Must be "email@domain.com" or "Display Name <email@domain.com>".`);
    }
    return { formatted: `${displayName} <${address}>`, address, displayName };
  }

  const plainMatch = trimmed.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  if (plainMatch) {
    const address = plainMatch[1].trim().toLowerCase();
    return { formatted: address, address, displayName: '' };
  }

  throw new Error(`Invalid EMAIL_FROM format: "${fromStr}". Must be "email@domain.com" or "Display Name <email@domain.com>".`);
}

/**
 * Validates Resend API key format (must start with "re_").
 */
function validateResendApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Email service is not configured. Please set RESEND_API_KEY environment variable.');
  }
  const trimmed = apiKey.trim();
  if (!trimmed.startsWith('re_')) {
    throw new Error('Invalid RESEND_API_KEY format. Resend API keys must start with "re_".');
  }
  return trimmed;
}

/**
 * Checks if recipient is an internal or test dummy address used during tests/local development.
 */
function isTestDummyRecipient(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();
  return lower.endsWith('.internal') ||
         lower.endsWith('.local') ||
         lower.endsWith('.test') ||
         lower.endsWith('.example') ||
         lower.endsWith('.invalid') ||
         lower.includes('@cartmandashboard.com') ||
         lower.includes('@cartman.internal') ||
         lower.includes('@example.com');
}

/**
 * Checks if sender address uses Resend's default onboarding sandbox domain.
 */
function isOnboardingSender(fromStr) {
  if (!fromStr || typeof fromStr !== 'string') return false;
  return fromStr.toLowerCase().includes('onboarding@resend.dev');
}

class EmailService {
  /**
   * Helper exports for unit testing and validation
   */
  static parseSender(fromStr) {
    return parseSender(fromStr);
  }

  static validateApiKey(apiKey) {
    return validateResendApiKey(apiKey);
  }

  static isTestDummyRecipient(email) {
    return isTestDummyRecipient(email);
  }

  static isOnboardingSender(fromStr) {
    return isOnboardingSender(fromStr);
  }

  /**
   * Send a 6-digit OTP verification email to the owner
   * @param {Object} params
   * @param {string} params.email Recipient email address
   * @param {string} params.otp 6-digit numeric OTP code
   * @param {boolean} [params.forceResend=false] Force dispatch via Resend REST API even in dev mode
   */
  static async sendOtp({ email, otp, forceResend = false }) {
    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new Error('Email address is required.');
    }
    if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
      throw new Error('A valid 6-digit numeric OTP code is required.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    // Dynamically retrieve configured sender & API key (supports runtime updates & config overrides)
    const fromHeaderRaw = (typeof config.emailFrom === 'string' && config.emailFrom.trim()) ? config.emailFrom : (process.env.EMAIL_FROM || '');
    const parsedSender = parseSender(fromHeaderRaw);

    const rawApiKey = (typeof config.resendApiKey === 'string' ? config.resendApiKey : (process.env.RESEND_API_KEY || '')).trim();
    const hasResendApiKey = Boolean(rawApiKey && rawApiKey.startsWith('re_'));
    const isProduction = config.nodeEnv === 'production';
    const isOnboarding = isOnboardingSender(parsedSender.address);
    const isDummyRecipient = isTestDummyRecipient(cleanEmail);

    // Development / Test mode fallback:
    // 1. If Resend API key is not configured, fallback to dev_mock.
    // 2. If using onboarding@resend.dev sandbox to send to an internal/test dummy address (and not forceResend),
    //    route to dev_mock so local test suites and offline dev run reliably without hitting external 403 sandbox restrictions.
    const shouldUseDevMock = !isProduction && !forceResend && (!hasResendApiKey || (isOnboarding && isDummyRecipient));

    if (shouldUseDevMock) {
      lastDevOtp = { email: cleanEmail, otp: cleanOtp, sentAt: Date.now() };
      console.log(`[DEV EMAIL SERVICE] OTP dispatched to ${cleanEmail}: ${cleanOtp} (Valid for ${config.otpExpiryMinutes} minutes)`);
      return {
        success: true,
        mode: 'dev_mock',
        message: `OTP dispatched in dev mode to ${cleanEmail}`
      };
    }

    // When live delivery is required:
    // Validate API key strictly (throws safe, descriptive error if missing or invalid)
    const apiKey = validateResendApiKey(rawApiKey);

    // In production, lastDevOtp MUST NOT be retained
    if (!isProduction) {
      lastDevOtp = { email: cleanEmail, otp: cleanOtp, sentAt: Date.now() };
    } else {
      lastDevOtp = null;
    }

    return this._sendViaResend({
      email: cleanEmail,
      otp: cleanOtp,
      sender: parsedSender.formatted,
      apiKey
    });
  }

  /**
   * Dispatch email via Resend API (Node 16+ compatible without external dependencies)
   */
  static _sendViaResend({ email, otp, sender, apiKey }) {
    return new Promise((resolve, reject) => {
      const fromHeader = sender || ((typeof config.emailFrom === 'string' && config.emailFrom.trim()) ? config.emailFrom : (process.env.EMAIL_FROM || ''));
      const key = (apiKey || (typeof config.resendApiKey === 'string' ? config.resendApiKey : (process.env.RESEND_API_KEY || ''))).trim();

      const subject = `🔐 Your Cartman Dashboard Access Code: ${otp}`;
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0; }
            .card { max-width: 460px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 32px 24px; text-align: center; }
            .logo { font-size: 28px; font-weight: 800; color: #38bdf8; margin-bottom: 8px; letter-spacing: -0.5px; }
            .subtitle { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
            .otp-box { font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #10b981; background: #0f172a; border: 2px dashed #059669; border-radius: 8px; padding: 16px; margin: 20px 0; display: inline-block; width: 85%; }
            .alert { font-size: 13px; color: #cbd5e1; margin-top: 16px; line-height: 1.5; }
            .footer { font-size: 11px; color: #64748b; margin-top: 28px; border-top: 1px solid #334155; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo">Cartman Dashboard</div>
            <div class="subtitle">Secure One-Time Access Verification</div>
            <p style="font-size: 14px; margin: 0 0 12px 0;">Use the 6-digit code below to sign in to your dashboard:</p>
            <div class="otp-box">${otp}</div>
            <div class="alert">
              ⏳ <strong>Expires in ${config.otpExpiryMinutes} minutes.</strong><br>
              This code can only be used once. If you did not request this verification, you can safely ignore this email.
            </div>
            <div class="footer">
              Cartman Multi-Marketplace Analytics &bull; Private Owner Portal
            </div>
          </div>
        </body>
        </html>
      `;

      const payload = JSON.stringify({
        from: fromHeader,
        to: [email],
        subject,
        html
      });

      const options = {
        hostname: 'api.resend.com',
        port: 443,
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
          let data = {};
          try { data = JSON.parse(responseBody); } catch (e) {}

          const statusCode = res.statusCode || 0;

          if (statusCode >= 200 && statusCode < 300) {
            if (config.nodeEnv !== 'production') {
              console.log(`[RESEND SUCCESS] Dispatched OTP email to ${email}, id: ${data.id}`);
            }
            return resolve({ success: true, id: data.id, mode: 'resend' });
          }

          // Map error safely without leaking secrets or full sensitive responses
          const safeError = EmailService._mapResendError(statusCode, data, fromHeader);

          if (config.nodeEnv !== 'production') {
            console.error(`[RESEND API ERROR] HTTP ${statusCode}: ${safeError.message}`);
          } else {
            // In production: do not log OTP, API key, auth header, or full provider payload
            console.error(`[EMAIL SERVICE] Resend delivery failed with HTTP ${statusCode}: ${safeError.message}`);
          }

          reject(safeError);
        });
      });

      req.on('error', (err) => {
        if (config.nodeEnv !== 'production') {
          console.error('[RESEND NETWORK ERROR]', err.message);
        } else {
          console.error('[EMAIL SERVICE] Network error communicating with email provider');
        }
        reject(new Error(`Email provider network error: ${err.message || 'Unable to connect to Resend API'}`));
      });

      // 15-second network request timeout
      req.setTimeout(15000, () => {
        req.destroy(new Error('Email provider connection timed out after 15 seconds'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Safely maps Resend HTTP errors to clean, informative, non-leaking application errors.
   */
  static _mapResendError(statusCode, data = {}, fromHeader = '') {
    const providerMessage = (data && typeof data.message === 'string') ? data.message.trim() : '';

    if (statusCode === 401) {
      return new Error('Resend API authentication failed. Please verify that RESEND_API_KEY is valid and active.');
    }

    if (statusCode === 403) {
      const isTestingRestriction = providerMessage.toLowerCase().includes('testing emails') ||
        providerMessage.toLowerCase().includes('verify your domain') ||
        (fromHeader && fromHeader.toLowerCase().includes('onboarding@resend.dev'));

      if (isTestingRestriction) {
        return new Error('Resend sandbox restriction: onboarding@resend.dev can only deliver to the verified Resend account owner email. To deliver to other recipients, verify a custom domain in Resend and update EMAIL_FROM.');
      }
      return new Error(`Resend delivery forbidden (HTTP 403): ${providerMessage || 'Domain or account permissions check failed'}. Verify your domain in the Resend dashboard.`);
    }

    if (statusCode === 422) {
      return new Error(`Resend rejected the email request (HTTP 422): ${providerMessage || 'Invalid sender or recipient formatting'}.`);
    }

    if (statusCode === 429) {
      return new Error('Resend rate limit exceeded (HTTP 429). Too many emails sent in a short window. Please try again shortly.');
    }

    if (statusCode >= 500) {
      return new Error(`Resend service temporarily unavailable (HTTP ${statusCode}). Please try again later.`);
    }

    return new Error(`Resend delivery failed with HTTP ${statusCode}: ${providerMessage || 'Unexpected provider response'}`);
  }

  /**
   * Returns dispatched OTP in development/test mode only.
   * Strictly returns null in production mode.
   */
  static getLastDevOtp() {
    if (config.nodeEnv === 'production') {
      return null;
    }
    return lastDevOtp ? lastDevOtp.otp : null;
  }

  static clearDevOtp() {
    lastDevOtp = null;
  }
}

module.exports = EmailService;
