const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole, logAudit } = require('../auth/middleware');
const { MARKETPLACE_SPECS } = require('../integrations/marketplaceSpecs');
const MarketplaceAdapters = require('../integrations/marketplaceAdapters');
const { syncScheduler, SyncScheduler } = require('../integrations/syncScheduler');
const { db, TABLES } = require('../db');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30 MB
});

// Official Marketplace API Specs & Requirements
router.get('/specs', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: MARKETPLACE_SPECS
  });
});

// Upload Fallback Marketplace Report (Amazon MTR/settlement, Flipkart xlsx, Meesho CSV, Blinkit CSV)
router.post('/report-upload', requireAuth, requireRole(['Admin', 'Accounts']), upload.single('reportFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload a valid report file.' });
    }

    const { accountId, marketplace } = req.body;
    if (!accountId || !marketplace) {
      return res.status(400).json({ success: false, error: 'accountId and marketplace parameters are required.' });
    }

    const result = MarketplaceAdapters.ingestReportFile(
      req.file.buffer,
      req.file.originalname,
      accountId,
      marketplace
    );

    logAudit(req.user.id, 'MARKETPLACE_REPORT_INGESTED', 'MARKETPLACE_ACCOUNT', accountId, {
      filename: req.file.originalname,
      marketplace,
      ordersIngested: result.ordersIngested,
      settlementsIngested: result.settlementsIngested
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Sync History Logs
router.get('/sync-logs', requireAuth, (req, res) => {
  try {
    const logs = SyncScheduler.getSyncHistory(50);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run synchronization for all accounts
router.post('/sync-all', requireAuth, requireRole(['Admin', 'Accounts']), async (req, res) => {
  try {
    await syncScheduler.runSyncCycle('manual_bulk');
    logAudit(req.user.id, 'BULK_SYNC_TRIGGERED', 'SYSTEM');
    res.json({ success: true, message: 'Bulk synchronization completed for all connected marketplace accounts.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit Logs (Admin only)
router.get('/audit-logs', requireAuth, requireRole(['Admin']), (req, res) => {
  try {
    const logs = db.find(TABLES.AUDIT_LOGS);
    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: logs.slice(0, 100) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
