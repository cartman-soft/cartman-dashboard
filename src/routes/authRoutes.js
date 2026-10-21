const express = require('express');
const router = express.Router();
const AuthService = require('../auth/authService');
const { requireAuth } = require('../auth/middleware');
const config = require('../config');

// Primary Login: Username/Email + Password -> Returns JWT Session directly
router.post('/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const identifier = username || email;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Username/Email and password are required.' });
    }

    const result = await AuthService.login({
      username: identifier,
      password,
      ip: req.ip || (req.connection && req.connection.remoteAddress)
    });

    res.json({
      success: true,
      message: 'Authentication successful.',
      token: result.token,
      user: result.user
    });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Request Passwordless Email OTP
router.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1').split(',')[0].trim();
    const result = await AuthService.requestEmailOtp({ email, ip });

    res.json({
      success: true,
      message: result.message,
      deliveryMode: result.deliveryMode,
      email: result.email,
      challengeToken: result.challengeToken,
      expiresInSeconds: result.expiresInSeconds
    });
  } catch (err) {
    const isConfigError = err.message.includes('Server Configuration Error') || err.message.includes('not configured');
    const isForbidden = err.message.includes('Access Denied');
    const isRateLimit = err.message.includes('Too many OTP requests');
    const isDeliveryError = err.message.includes('delivery failed') || err.message.includes('Email service is not configured') || err.message.includes('Resend');
    const status = isConfigError ? 500 : isForbidden ? 403 : isRateLimit ? 429 : isDeliveryError ? 502 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Verify Passwordless OTP -> Returns JWT Session
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, challengeToken } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit OTP code are required.' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1').split(',')[0].trim();
    const result = await AuthService.verifyEmailOtp({ email, otp, challengeToken, ip });

    res.json({
      success: true,
      message: result.message,
      token: result.token,
      user: result.user
    });
  } catch (err) {
    const isConfigError = err.message.includes('Server Configuration Error') || err.message.includes('not configured');
    const isForbidden = err.message.includes('Access Denied');
    const isRateLimit = err.message.includes('Maximum verification attempts exceeded');
    const status = isConfigError ? 500 : isForbidden ? 403 : isRateLimit ? 429 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Legacy Step 1: Initiate Login (Optional 2FA dispatch)
router.post('/initiate-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }
    const result = await AuthService.initiateLogin({
      email,
      password,
      ip: req.ip || (req.connection && req.connection.remoteAddress)
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Current User Profile
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    isDemoMode: Boolean(config.isDemoMode)
  });
});

// Logout endpoint
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully.'
  });
});

module.exports = router;
