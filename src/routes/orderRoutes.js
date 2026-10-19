const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/middleware');
const SalesEngine = require('../calculations/salesEngine');
const { db, TABLES } = require('../db');

// Order Summary by Status (Company, Marketplace, and Account breakdown)
router.get('/summary', requireAuth, (req, res) => {
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
    const overview = SalesEngine.getCompanyOverview(filter, isDemoIncluded);

    // Provide detailed status mapping references
    const statusLegend = [
      { status: 'New', description: 'Order created or placed by customer, pending merchant acknowledgement.' },
      { status: 'Processing', description: 'Order confirmed, picked, packed, and awaiting courier pickup.' },
      { status: 'Shipped', description: 'Handed over to carrier, dispatched or in-transit to delivery hub.' },
      { status: 'Delivered', description: 'Successfully handed over to customer; eligible for settlement.' },
      { status: 'Cancelled', description: 'Cancelled prior to shipment by customer, merchant, or marketplace fraud check.' },
      { status: 'Returned', description: 'Customer return, Return-to-Origin (RTO), or undelivered shipment.' }
    ];

    res.json({
      success: true,
      periodInfo: overview.periodInfo,
      companyStatusCounts: overview.grandTotals.statusCounts,
      totalOrders: overview.grandTotals.totalOrders,
      marketplaceBreakdown: overview.marketplaces.map(m => ({
        key: m.key,
        displayName: m.displayName,
        totalOrders: m.totalOrders,
        statusCounts: m.statusCounts
      })),
      accountBreakdown: overview.allAccounts.map(a => ({
        accountId: a.accountId,
        accountName: a.accountName,
        marketplace: a.marketplace,
        totalOrders: a.totalOrders,
        statusCounts: a.statusCounts,
        isDemo: a.isDemo
      })),
      statusLegend
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
