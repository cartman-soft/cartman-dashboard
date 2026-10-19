const express = require('express');
const router = express.Router();
const AuthService = require('../auth/authService');
const { requireAuth } = require('../auth/middleware');

// Step 1: Login with Email + Password -> Dispatches OTP
router.post('/login', async (req, res) => {
  if (config.isDemoMode) {
    return res.status(403).json({
      success: false,
      error: 'Disabled in Public Demo: Login is disabled in public demo mode. Guest access is active.'
    });
  }
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }
    const result = await AuthService.initiateLogin({
      email,
      password,
      ip: req.ip || req.connection.remoteAddress
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Step 2: Verify OTP -> Returns JWT Session
router.post('/verify-otp', async (req, res) => {
  if (config.isDemoMode) {
    return res.status(403).json({
      success: false,
      error: 'Disabled in Public Demo: OTP verification is disabled in public demo mode.'
    });
  }
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit OTP code are required.' });
    }
    const result = await AuthService.verifyOtp({ email, otp });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

const config = require('../config');

// Current User Profile
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    isDemoMode: Boolean(config.isDemoMode)
  });
});

module.exports = router;
