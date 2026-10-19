const express = require('express');
const router = express.Router();
const SalesEngine = require('../calculations/salesEngine');
const { requireAuth } = require('../auth/middleware');
const { db, TABLES } = require('../db');

// Main Company Overview + Marketplace Cards
router.get('/overview', requireAuth, (req, res) => {
  try {
    const { period, date, month, startDate, endDate, includeDemo } = req.query;

    const filter = {
      period: period || 'monthly',
      date,
      month,
      startDate,
      endDate
    };

    const isDemoIncluded = includeDemo === undefined ? true : includeDemo === 'true';

    const data = SalesEngine.getCompanyOverview(filter, isDemoIncluded);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Daily Trends for Interactive Charts
router.get('/trends', requireAuth, (req, res) => {
  try {
    const { days = 14, includeDemo = 'true' } = req.query;
    const isDemoIncluded = includeDemo === 'true';

    const numDays = Math.min(parseInt(days, 10) || 14, 60);
    const today = new Date();
    const trendList = [];

    const orders = db.find(TABLES.ORDERS, o => isDemoIncluded || !o.isDemo);
    const bankTxns = db.find(TABLES.BANK_TRANSACTIONS, tx => isDemoIncluded || !tx.isDemo);

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      let dayGross = 0;
      let dayNet = 0;
      let dayOrders = 0;

      for (const o of orders) {
        if (o.orderDate === dateStr) {
          dayGross += (Number(o.grossAmount) || 0);
          dayNet += (Number(o.netAmount) !== undefined ? Number(o.netAmount) : Number(o.grossAmount));
          dayOrders += 1;
        }
      }

      let dayBankReceipts = 0;
      for (const tx of bankTxns) {
        if (tx.transactionDate === dateStr && tx.creditAmount > 0) {
          dayBankReceipts += Number(tx.creditAmount);
        }
      }

      trendList.push({
        date: dateStr,
        grossSales: Math.round(dayGross),
        netSales: Math.round(dayNet),
        bankReceipts: Math.round(dayBankReceipts),
        ordersCount: dayOrders
      });
    }

    res.json({ success: true, data: trendList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
