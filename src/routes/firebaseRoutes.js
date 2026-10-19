/**
 * Firebase Configuration and Synchronization API Routes
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { requireAuth } = require('../auth/middleware');

const FIREBASE_CONFIG_PATH = path.resolve(__dirname, '../../data/firebase_config.json');

function getStoredFirebaseConfig() {
  try {
    if (fs.existsSync(FIREBASE_CONFIG_PATH)) {
      const raw = fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[FIREBASE] Error reading firebase_config.json:', err.message);
  }

  // Fallback to environment variables
  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
    isConfigured: !!(process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID)
  };
}

// GET /api/firebase/config - Get current Firebase config
router.get('/config', (req, res) => {
  if (config.isDemoMode) {
    return res.json({
      success: true,
      data: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
        measurementId: '',
        isConfigured: false,
        isDemoMode: true
      }
    });
  }
  const cfg = getStoredFirebaseConfig();
  res.json({
    success: true,
    data: {
      ...cfg,
      isConfigured: !!(cfg.apiKey && cfg.projectId)
    }
  });
});

// POST /api/firebase/config - Save Firebase configuration
router.post('/config', requireAuth, (req, res) => {
  try {
    const { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId } = req.body;

    if (!apiKey || !projectId) {
      return res.status(400).json({
        success: false,
        error: 'Both apiKey and projectId are required to configure Firebase.'
      });
    }

    const payload = {
      apiKey: apiKey.trim(),
      authDomain: (authDomain || '').trim(),
      projectId: projectId.trim(),
      storageBucket: (storageBucket || '').trim(),
      messagingSenderId: (messagingSenderId || '').trim(),
      appId: (appId || '').trim(),
      measurementId: (measurementId || '').trim(),
      updatedAt: new Date().toISOString()
    };

    const dir = path.dirname(FIREBASE_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(FIREBASE_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf8');

    res.json({
      success: true,
      message: 'Firebase configuration saved successfully.',
      data: {
        ...payload,
        isConfigured: true
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
