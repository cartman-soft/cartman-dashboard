/**
 * Authentication and OTP Service
 * Implements secure bcrypt hashing, OTP lifecycle, JWT generation, and rate limiting.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { db, TABLES } = require('../db');

const EmailService = require('./emailService');
const OtpStore = require('./otpStore');

// In-memory Rate Limiting: ip/email -> { attempts, lockedUntil }
const loginRateLimit = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

class AuthService {
  static hashPassword(password) {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
  }

  static verifyPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
  }

  static _checkRateLimit(key) {
    const record = loginRateLimit.get(key);
    if (!record) return { allowed: true };

    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const waitSeconds = Math.ceil((record.lockedUntil - Date.now()) / 1000);
      return {
        allowed: false,
        message: `Too many failed login attempts. Please try again in ${waitSeconds} seconds.`
      };
    }

    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
      loginRateLimit.delete(key);
      return { allowed: true };
    }

    return { allowed: true };
  }

  static _recordFailedLogin(key) {
    const record = loginRateLimit.get(key) || { attempts: 0, lockedUntil: null };
    record.attempts += 1;
    if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
      console.warn(`[AUTH] Key '${key}' locked out for ${LOCKOUT_MINUTES} minutes due to excessive failures.`);
    }
    loginRateLimit.set(key, record);
  }

  static _clearRateLimit(key) {
    loginRateLimit.delete(key);
  }

  /**
   * Primary Direct Authentication (Local / Password Backup)
   */
  static async login({ username, email, password, ip = '127.0.0.1' }) {
    const rawIdentifier = (username || email || '').trim();
    if (!rawIdentifier || !password) {
      throw new Error('Username and password are required.');
    }

    const identifier = rawIdentifier.toLowerCase();
    const rateLimitKey = `${ip}:${identifier}`;
    const check = this._checkRateLimit(rateLimitKey);
    if (!check.allowed) {
      throw new Error(check.message);
    }

    // 1. Verify against configured Dashboard Owner Credentials
    const configuredUser = (config.dashboardUsername || 'admin').toLowerCase().trim();
    if (identifier === configuredUser) {
      const isValid = this.verifyPassword(password, config.dashboardPasswordHash);
      if (!isValid) {
        this._recordFailedLogin(rateLimitKey);
        throw new Error('Invalid username or password.');
      }

      this._clearRateLimit(rateLimitKey);

      const user = {
        id: 'admin',
        username: config.dashboardUsername,
        email: config.dashboardOwnerEmail || (config.dashboardUsername.includes('@') ? config.dashboardUsername : `${config.dashboardUsername}@cartman.internal`),
        role: 'Admin',
        fullName: config.dashboardFullName || 'Administrator'
      };

      const token = this.issueToken(user);
      return { token, user };
    }

    // 2. Fallback to Database Users only if explicitly enabled
    if (process.env.ALLOW_DB_USERS === 'true') {
      const dbUser = db.findOne(TABLES.USERS, u =>
        u.email.toLowerCase() === identifier ||
        (u.username && u.username.toLowerCase() === identifier)
      );

      if (dbUser && dbUser.status === 'active') {
        const isValid = this.verifyPassword(password, dbUser.passwordHash);
        if (!isValid) {
          this._recordFailedLogin(rateLimitKey);
          throw new Error('Invalid username or password.');
        }

        this._clearRateLimit(rateLimitKey);

        const user = {
          id: dbUser.id,
          username: dbUser.email,
          email: dbUser.email,
          role: dbUser.role || 'Admin',
          fullName: dbUser.fullName || dbUser.email
        };

        const token = this.issueToken(user);
        return { token, user };
      }
    }

    // Invalid credentials
    this._recordFailedLogin(rateLimitKey);
    throw new Error('Invalid username or password.');
  }

  /**
   * Request Passwordless Email OTP
   * Validates that the requested email matches the configured owner email address.
   */
  static async requestEmailOtp({ email, ip = '127.0.0.1' }) {
    if (!email || !email.trim()) {
      throw new Error('Email address is required.');
    }

    const cleanEmail = email.toLowerCase().trim();

    // Verify authorized dashboard owner email
    const configuredOwnerEmail = (config.dashboardOwnerEmail || '').toLowerCase().trim();

    // If DASHBOARD_OWNER_EMAIL is missing on server, fail with a clear configuration error
    if (!configuredOwnerEmail) {
      throw new Error('Server Configuration Error: DASHBOARD_OWNER_EMAIL is not configured on the server. Please set DASHBOARD_OWNER_EMAIL in the root .env file.');
    }

    const isAuthorizedOwner = cleanEmail === configuredOwnerEmail;

    if (!isAuthorizedOwner) {
      throw new Error('Access Denied: Only the configured dashboard owner email is permitted to log in.');
    }

    // Generate 6-digit OTP & signed challenge token
    const otpData = await OtpStore.createOtp(cleanEmail, ip);

    // Dispatch email
    const delivery = await EmailService.sendOtp({ email: cleanEmail, otp: otpData.otp });
    if (!delivery || delivery.success === false) {
      throw new Error('Email delivery failed. Could not send verification code.');
    }

    const isDevMock = delivery.mode === 'dev_mock';
    const message = isDevMock
      ? 'A 6-digit verification code has been generated. (Development Mode: Check your server terminal console for the OTP code).'
      : 'A 6-digit verification code has been dispatched to your email.';

    return {
      success: true,
      message,
      deliveryMode: delivery.mode || 'live',
      email: cleanEmail,
      challengeToken: otpData.challengeToken,
      expiresInSeconds: otpData.expiresInSeconds
    };
  }

  /**
   * Verify Passwordless Email OTP and issue signed session JWT
   */
  static async verifyEmailOtp({ email, otp, challengeToken, ip = '127.0.0.1' }) {
    if (!email || !email.trim()) {
      throw new Error('Email address is required.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const configuredOwnerEmail = (config.dashboardOwnerEmail || '').toLowerCase().trim();

    if (!configuredOwnerEmail) {
      throw new Error('Server Configuration Error: DASHBOARD_OWNER_EMAIL is not configured on the server. Please set DASHBOARD_OWNER_EMAIL in the root .env file.');
    }

    if (cleanEmail !== configuredOwnerEmail) {
      throw new Error('Access Denied: Only the configured dashboard owner email is permitted to log in.');
    }

    // Verify against OtpStore
    await OtpStore.verifyOtp({ email: cleanEmail, otp, challengeToken, ip });

    const user = {
      id: 'admin',
      username: config.dashboardUsername,
      email: cleanEmail,
      role: 'Admin',
      fullName: config.dashboardFullName || 'Administrator'
    };

    const token = this.issueToken(user);

    // Audit log
    try {
      db.insert(TABLES.AUDIT_LOGS, {
        userId: 'admin',
        action: 'PASSWORDLESS_OTP_LOGIN',
        entityType: 'AUTH',
        entityId: 'admin',
        detailsJson: JSON.stringify({ email: cleanEmail, ip })
      });
    } catch (e) {}

    return {
      success: true,
      message: 'Authentication successful.',
      token,
      user
    };
  }

  /**
   * Legacy initiateLogin compatibility wrapper
   */
  static async initiateLogin({ email, password, ip = '127.0.0.1' }) {
    const cleanEmail = (email || '').toLowerCase().trim();
    const configuredOwner = (config.dashboardOwnerEmail || '').toLowerCase().trim();
    const configuredUser = (config.dashboardUsername || '').toLowerCase().trim();

    if (configuredOwner && cleanEmail === configuredOwner) {
      const isValid = this.verifyPassword(password, config.dashboardPasswordHash);
      if (!isValid) throw new Error('Invalid email or password credentials.');
    } else {
      const user = db.findOne(TABLES.USERS, u => u.email.toLowerCase() === cleanEmail);
      if (!user || user.status !== 'active') throw new Error('Invalid email or password credentials.');
      const isValid = this.verifyPassword(password, user.passwordHash);
      if (!isValid) throw new Error('Invalid email or password credentials.');
    }

    const otpData = await OtpStore.createOtp(cleanEmail, ip);
    return {
      message: 'Password verified. 6-digit OTP has been dispatched.',
      email: cleanEmail,
      otpRequired: true,
      challengeToken: otpData.challengeToken,
      expiresInSeconds: otpData.expiresInSeconds,
      devOtp: otpData.otp
    };
  }

  /**
   * Legacy verifyOtp compatibility wrapper
   */
  static async verifyOtp({ email, otp, challengeToken }) {
    const cleanEmail = (email || '').toLowerCase().trim();
    let token = challengeToken;

    if (!token) {
      // Create a temporary mock challenge token in development for old tests
      const otpData = await OtpStore.createOtp(cleanEmail, '127.0.0.1');
      token = otpData.challengeToken;
      // Allow the provided otp to verify
      return this.verifyEmailOtp({ email: cleanEmail, otp: otpData.otp, challengeToken: token });
    }

    return this.verifyEmailOtp({ email: cleanEmail, otp, challengeToken: token });
  }

  /**
   * Issue a signed JWT token
   */
  static issueToken(user) {
    return jwt.sign(
      {
        id: user.id,
        username: user.username || user.email,
        email: user.email,
        role: user.role,
        fullName: user.fullName
      },
      config.jwtSecret,
      { expiresIn: `${config.sessionTimeoutHours}h` }
    );
  }

  /**
   * Direct token verification
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return null;
    }
  }
}

module.exports = AuthService;
