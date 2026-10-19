const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, logAudit } = require('../auth/middleware');
const { db, TABLES } = require('../db');
const MarketplaceAdapters = require('../integrations/marketplaceAdapters');
const { syncScheduler } = require('../integrations/syncScheduler');

// Get all marketplace accounts
router.get('/', requireAuth, (req, res) => {
  try {
    const accounts = db.find(TABLES.MARKETPLACE_ACCOUNTS);
    // Hide secret credentials before sending to client
    const safeAccounts = accounts.map(a => {
      let credentialsObj = {};
      try {
        credentialsObj = JSON.parse(a.credentialsJson || '{}');
      } catch (e) {}

      // Mask sensitive fields
      const maskedCreds = {};
      for (const [k, v] of Object.entries(credentialsObj)) {
        if (k.toLowerCase().includes('secret') || k.toLowerCase().includes('token') || k.toLowerCase().includes('key')) {
          maskedCreds[k] = v ? '••••••••••••••••' : '';
        } else {
          maskedCreds[k] = v;
        }
      }

      return {
        ...a,
        credentials: maskedCreds,
        credentialsJson: undefined // remove raw JSON
      };
    });

    res.json({ success: true, data: safeAccounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create new marketplace account (Admin only)
router.post('/', requireAuth, requireRole(['Admin']), async (req, res) => {
  try {
    const { marketplace, accountName, sellerId, credentials = {} } = req.body;

    if (!marketplace || !accountName || !sellerId) {
      return res.status(400).json({
        success: false,
        error: 'Marketplace, Account Name, and Seller ID are required.'
      });
    }

    const mkt = marketplace.toLowerCase();
    if (!['amazon', 'flipkart', 'meesho', 'blinkit'].includes(mkt)) {
      return res.status(400).json({ success: false, error: 'Unsupported marketplace.' });
    }

    // Test connection
    const test = await MarketplaceAdapters.testConnection(mkt, { ...credentials, sellerId });

    const newAccount = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
      marketplace: mkt,
      accountName,
      sellerId,
      connectionStatus: test.success ? 'connected' : 'auth_error',
      lastError: test.success ? null : test.message,
      credentialsJson: JSON.stringify(credentials),
      lastSyncAt: test.success ? new Date().toISOString() : null,
      isDemo: false
    });

    logAudit(req.user.id, 'ACCOUNT_CREATED', 'MARKETPLACE_ACCOUNT', newAccount.id, {
      marketplace: mkt,
      accountName,
      sellerId
    });

    res.json({
      success: true,
      message: `Account '${accountName}' created successfully.`,
      data: newAccount,
      testStatus: test
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update marketplace account configuration
router.put('/:id', requireAuth, requireRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { accountName, credentials, connectionStatus } = req.body;

    const updates = {};
    if (accountName) updates.accountName = accountName;
    if (connectionStatus) updates.connectionStatus = connectionStatus;
    if (credentials) {
      updates.credentialsJson = JSON.stringify(credentials);
    }

    const updated = db.update(TABLES.MARKETPLACE_ACCOUNTS, id, updates);

    logAudit(req.user.id, 'ACCOUNT_UPDATED', 'MARKETPLACE_ACCOUNT', id, { accountName });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Trigger on-demand sync for an account (Admin, Accounts)
router.post('/:id/sync', requireAuth, requireRole(['Admin', 'Accounts']), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await syncScheduler.syncAccount(id, 'manual');

    logAudit(req.user.id, 'ACCOUNT_SYNC_TRIGGERED', 'MARKETPLACE_ACCOUNT', id, result);

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
