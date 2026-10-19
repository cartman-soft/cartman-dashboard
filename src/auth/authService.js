/**
 * Authentication and OTP Service
 * Implements secure bcrypt hashing, OTP lifecycle, JWT generation, and rate limiting.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { db, TABLES } = require('../db');

// In-memory OTP storage: email -> { code, expiresAt, attempts }
const otpStore = new Map();

// In-memory Rate Limiting: ip/email -> { attempts, lockedUntil }
const loginRateLimit = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 3;

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
   * Step 1: Verify Email and Password, generate 6-digit OTP
   */
  static async initiateLogin({ email, password, ip = '127.0.0.1' }) {
    const rateLimitKey = `${ip}:${email.toLowerCase().trim()}`;
    const check = this._checkRateLimit(rateLimitKey);
    if (!check.allowed) {
      throw new Error(check.message);
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = db.findOne(TABLES.USERS, u => u.email.toLowerCase() === cleanEmail);

    if (!user || user.status !== 'active') {
      this._recordFailedLogin(rateLimitKey);
      throw new Error('Invalid email or password credentials.');
    }

    const passwordValid = this.verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      this._recordFailedLogin(rateLimitKey);
      throw new Error('Invalid email or password credentials.');
    }

    // Reset failed login count on valid credentials
    this._clearRateLimit(rateLimitKey);

    // Generate cryptographically secure 6-digit OTP
    const otpNumber = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

    otpStore.set(cleanEmail, {
      code: otpNumber,
      userId: user.id,
      expiresAt,
      attempts: 0
    });

    console.log(`[AUTH] OTP generated for ${cleanEmail}: ${otpNumber} (expires in ${OTP_EXPIRY_MINUTES}m)`);

    return {
      message: 'Password verified. 6-digit OTP has been dispatched.',
      email: cleanEmail,
      otpRequired: true,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      // For convenience in dev / pairing environment:
      devOtp: config.nodeEnv === 'development' ? otpNumber : undefined
    };
  }

  /**
   * Step 2: Verify OTP and issue JWT session token
   */
  static async verifyOtp({ email, otp }) {
    const cleanEmail = email.toLowerCase().trim();
    const record = otpStore.get(cleanEmail);

    if (!record) {
      throw new Error('No pending OTP request found or OTP expired. Please log in again.');
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(cleanEmail);
      throw new Error('OTP has expired. Please request a new OTP.');
    }

    record.attempts += 1;
    // Allow master test OTP in development mode
    const isValid = record.code === otp.trim() || (config.nodeEnv === 'development' && otp.trim() === '123456');

    if (!isValid) {
      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        otpStore.delete(cleanEmail);
        throw new Error('Maximum OTP verification attempts exceeded. Please initiate login again.');
      }
      throw new Error(`Invalid OTP code. ${MAX_OTP_ATTEMPTS - record.attempts} attempts remaining.`);
    }

    // OTP verified successfully
    otpStore.delete(cleanEmail);

    const user = db.findById(TABLES.USERS, record.userId);
    if (!user || user.status !== 'active') {
      throw new Error('User account is suspended or not found.');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName
      },
      config.jwtSecret,
      { expiresIn: `${config.sessionTimeoutHours}h` }
    );

    // Log login audit
    db.insert(TABLES.AUDIT_LOGS, {
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'AUTH',
      entityId: user.id,
      detailsJson: JSON.stringify({ email: user.email, role: user.role })
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName
      }
    };
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
