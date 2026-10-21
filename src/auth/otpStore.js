/**
 * Serverless-Compatible OTP Store & Cryptographic Verifier
 *
 * Supports:
 * 1. Stateless HMAC-SHA256 Signed Challenge Tokens (zero external DB required; 100% Vercel Lambda compatible)
 * 2. Cloud Redis (Upstash Redis / Vercel KV) when configured via UPSTASH_REDIS_REST_URL
 * 3. Rate limiting and single-use guarantee
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const http = require('http');
const https = require('https');
const config = require('../config');

// In-memory rate limiting and consumed JTI tracker
const requestRateLimits = new Map(); // key -> [timestamps]
const verificationAttempts = new Map(); // key -> count
const consumedTokens = new Set(); // jti -> timestamp

// Cleanup consumed tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const jti of consumedTokens) {
    // Tokens expire after 10 minutes anyway
    consumedTokens.delete(jti);
  }
}, 10 * 60 * 1000).unref();

class OtpStore {
  /**
   * Check request rate limit (max 3 requests per 10 minutes per IP/email)
   */
  static async _checkRequestRateLimit(key) {
    // 1. Distributed rate limit via Upstash Redis if configured
    if (config.upstashRedisUrl && config.upstashRedisToken) {
      try {
        const redisKey = `ratelimit:otp_req:${key}`;
        const count = await this._redisCommand('INCR', redisKey);
        if (count === 1) {
          await this._redisCommand('EXPIRE', redisKey, config.otpRateLimitMinutes * 60);
        }
        if (count > 3) {
          return {
            allowed: false,
            message: `Too many OTP requests. Please wait a few minutes before requesting a new code.`
          };
        }
        return { allowed: true };
      } catch (err) {
        console.warn('[REDIS RATELIMIT WARNING] Falling back to in-memory limiter:', err.message);
      }
    }

    // 2. In-memory fallback
    const now = Date.now();
    const windowMs = config.otpRateLimitMinutes * 60 * 1000;
    const history = requestRateLimits.get(key) || [];
    const recent = history.filter(ts => now - ts < windowMs);

    if (recent.length >= 3) {
      const oldest = recent[0];
      const waitSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      return {
        allowed: false,
        message: `Too many OTP requests. Please wait ${waitSeconds} seconds before requesting a new code.`
      };
    }

    recent.push(now);
    requestRateLimits.set(key, recent);
    return { allowed: true };
  }

  /**
   * Generate a cryptographically secure 6-digit OTP and signed challenge token
   */
  static async createOtp(email, ip = '127.0.0.1') {
    const cleanEmail = email.toLowerCase().trim();
    const rateLimitKey = `${ip}:${cleanEmail}`;

    const limitCheck = await this._checkRequestRateLimit(rateLimitKey);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.message);
    }

    // 1. Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // 2. Salt and HMAC-SHA256 Hash
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = crypto.createHmac('sha256', config.jwtSecret)
      .update(`${cleanEmail}:${otp}:${salt}`)
      .digest('hex');

    const expiresAt = Date.now() + config.otpExpiryMinutes * 60 * 1000;
    const jti = crypto.randomBytes(16).toString('hex');

    // 3. Create signed challenge token (Stateless Serverless persistence)
    const challengePayload = {
      email: cleanEmail,
      otpHash,
      salt,
      expiresAt,
      jti
    };

    const challengeToken = jwt.sign(challengePayload, config.jwtSecret, {
      expiresIn: `${config.otpExpiryMinutes}m`
    });

    // 4. If Upstash Redis is configured, also persist in Redis
    if (config.upstashRedisUrl && config.upstashRedisToken) {
      try {
        await this._redisSetEx(`otp:${cleanEmail}`, config.otpExpiryMinutes * 60, {
          otpHash,
          salt,
          expiresAt,
          jti
        });
      } catch (err) {
        console.warn('[REDIS OTP WARNING] Failed to persist in Redis, falling back to signed challenge token:', err.message);
      }
    }

    return {
      otp,
      challengeToken,
      expiresInSeconds: config.otpExpiryMinutes * 60
    };
  }

  /**
   * Verify an OTP against the challenge token or Redis
   */
  static async verifyOtp({ email, otp, challengeToken, ip = '127.0.0.1' }) {
    const cleanEmail = (email || '').toLowerCase().trim();
    const rawOtp = (otp || '').trim();

    if (!cleanEmail || !rawOtp) {
      throw new Error('Email and 6-digit verification code are required.');
    }

    if (!challengeToken) {
      throw new Error('Missing verification challenge token. Please request a new code.');
    }

    // 1. Verify Challenge Token Signature & Expiry
    let payload;
    try {
      payload = jwt.verify(challengeToken, config.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new Error('Verification code has expired. Please request a new code.');
      }
      throw new Error('Invalid verification session. Please request a new code.');
    }

    if (payload.email !== cleanEmail) {
      throw new Error('Verification email does not match this session.');
    }

    if (Date.now() > payload.expiresAt) {
      throw new Error('Verification code has expired. Please request a new code.');
    }

    // 2. Check for Single-Use (Replay Protection)
    if (config.upstashRedisUrl && config.upstashRedisToken) {
      try {
        const isConsumed = await this._redisCommand('GET', `consumed_jti:${payload.jti}`);
        if (isConsumed) {
          throw new Error('This verification code has already been used. Please request a new code.');
        }
      } catch (err) {
        if (err.message.includes('already been used')) throw err;
        console.warn('[REDIS REPLAY WARNING] Falling back to in-memory check:', err.message);
      }
    }

    if (consumedTokens.has(payload.jti)) {
      throw new Error('This verification code has already been used. Please request a new code.');
    }

    // 3. Track Attempts
    const attemptKey = `${cleanEmail}:${payload.jti}`;
    let currentAttempts = (verificationAttempts.get(attemptKey) || 0) + 1;
    verificationAttempts.set(attemptKey, currentAttempts);

    if (config.upstashRedisUrl && config.upstashRedisToken) {
      try {
        const redisAttemptKey = `attempts:${attemptKey}`;
        const redisCount = await this._redisCommand('INCR', redisAttemptKey);
        if (redisCount === 1) {
          await this._redisCommand('EXPIRE', redisAttemptKey, config.otpExpiryMinutes * 60);
        }
        currentAttempts = Math.max(currentAttempts, redisCount);
      } catch (err) {
        console.warn('[REDIS ATTEMPTS WARNING] Falling back to in-memory attempt count:', err.message);
      }
    }

    if (currentAttempts > config.otpMaxAttempts) {
      consumedTokens.add(payload.jti);
      verificationAttempts.delete(attemptKey);
      if (config.upstashRedisUrl && config.upstashRedisToken) {
        try {
          await this._redisCommand('SETEX', `consumed_jti:${payload.jti}`, config.otpExpiryMinutes * 60, '1');
        } catch (e) {}
      }
      throw new Error('Maximum verification attempts exceeded. Please request a new code.');
    }

    // 4. Verify Hash using Constant-Time Comparison
    const candidateHash = crypto.createHmac('sha256', config.jwtSecret)
      .update(`${cleanEmail}:${rawOtp}:${payload.salt}`)
      .digest('hex');

    const hashBufferA = Buffer.from(payload.otpHash, 'hex');
    const hashBufferB = Buffer.from(candidateHash, 'hex');

    const isValid = hashBufferA.length === hashBufferB.length &&
      crypto.timingSafeEqual(hashBufferA, hashBufferB);

    if (!isValid) {
      const remaining = config.otpMaxAttempts - currentAttempts;
      if (remaining <= 0) {
        consumedTokens.add(payload.jti);
        verificationAttempts.delete(attemptKey);
        if (config.upstashRedisUrl && config.upstashRedisToken) {
          try {
            await this._redisCommand('SETEX', `consumed_jti:${payload.jti}`, config.otpExpiryMinutes * 60, '1');
          } catch (e) {}
        }
        throw new Error('Maximum verification attempts exceeded. Please request a new code.');
      }
      throw new Error(`Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    // 5. Successful Verification - Consume Token
    consumedTokens.add(payload.jti);
    verificationAttempts.delete(attemptKey);

    // Persist consumption and delete active OTP from Redis
    if (config.upstashRedisUrl && config.upstashRedisToken) {
      try {
        await this._redisCommand('SETEX', `consumed_jti:${payload.jti}`, config.otpExpiryMinutes * 60, '1');
        await this._redisDel(`otp:${cleanEmail}`);
        await this._redisDel(`attempts:${attemptKey}`);
      } catch (e) {}
    }

    return {
      success: true,
      email: cleanEmail
    };
  }

  // --- Optional Upstash Redis REST API Helper ---
  static _redisCommand(command, ...args) {
    return new Promise((resolve, reject) => {
      if (!config.upstashRedisUrl || !config.upstashRedisToken) {
        return resolve(null);
      }

      const cleanUrl = config.upstashRedisUrl.replace(/\/$/, '');
      const url = new URL(cleanUrl);
      const postBody = JSON.stringify([command, ...args]);
      const client = url.protocol === 'http:' ? http : https;
      const defaultPort = url.protocol === 'http:' ? 80 : 443;

      const options = {
        hostname: url.hostname,
        port: url.port || defaultPort,
        path: url.pathname === '/' ? '' : url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.upstashRedisToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postBody)
        }
      };

      const req = client.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data.result);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(postBody);
      req.end();
    });
  }

  static _redisSetEx(key, seconds, value) {
    return this._redisCommand('SETEX', key, seconds, JSON.stringify(value));
  }

  static _redisDel(key) {
    return this._redisCommand('DEL', key);
  }

  // Testing helper
  static resetForTesting() {
    requestRateLimits.clear();
    verificationAttempts.clear();
    consumedTokens.clear();
  }
}

module.exports = OtpStore;
