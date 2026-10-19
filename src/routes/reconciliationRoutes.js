const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, logAudit } = require('../auth/middleware');
const ReconciliationMatcher = require('../reconciliation/matcher');

// Get full reconciliation summary
router.get('/summary', requireAuth, (req, res) => {
  try {
    const summary = ReconciliationMatcher.getReconciliationSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run automated reconciliation matching
router.post('/run', requireAuth, requireRole(['Admin', 'Accounts']), (req, res) => {
  try {
    const result = ReconciliationMatcher.runReconciliation();
    logAudit(req.user.id, 'RECONCILIATION_RUN', 'PAYMENT_RECONCILIATION', null, {
      newlyMatchedCount: result.newlyMatchedCount
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual match between a bank transaction and a settlement
router.post('/match', requireAuth, requireRole(['Admin', 'Accounts']), (req, res) => {
  try {
    const { bankTransactionId, settlementId, note } = req.body;
    if (!bankTransactionId || !settlementId) {
      return res.status(400).json({
        success: false,
        error: 'bankTransactionId and settlementId are required.'
      });
    }

    const result = ReconciliationMatcher.manualMatch(bankTransactionId, settlementId, note);
    logAudit(req.user.id, 'MANUAL_MATCH', 'BANK_TRANSACTION', bankTransactionId, { settlementId, note });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Unmatch a bank transaction
router.post('/unmatch', requireAuth, requireRole(['Admin', 'Accounts']), (req, res) => {
  try {
    const { bankTransactionId } = req.body;
    if (!bankTransactionId) {
      return res.status(400).json({ success: false, error: 'bankTransactionId is required.' });
    }

    const result = ReconciliationMatcher.unmatch(bankTransactionId);
    logAudit(req.user.id, 'UNMATCH_TRANSACTION', 'BANK_TRANSACTION', bankTransactionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
