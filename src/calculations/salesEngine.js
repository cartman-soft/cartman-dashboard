/**
 * Cartman Sales & Financial Calculation Engine
 *
 * Documented Calculation Rules:
 * 1. Gross Sales = SUM(Item Price * Quantity + Shipping Charges + Taxes) across all placed orders.
 * 2. Net Sales = Gross Sales - Cancellations - Returns - Customer Refunds.
 *    (Cancellations and refunds are deduplicated and deducted strictly once).
 * 3. Sales-vs-Received Gap = Net Sales (Selected Period) - Bank Receipts (Selected Period).
 *    Note: A positive gap reflects marketplace payout settlement lag (T+7 to T+15 days),
 *    logistics verification, return buffer reserves, and statutory withholding (TCS/TDS).
 * 4. Actual Settlement Pending = Outstanding net payable from finalized marketplace settlement
 *    reports (Status: 'pending' or 'on_hold') that have not yet been disbursed to bank.
 *    RULE: Never assume Sales - Bank Receipts = Settlement Pending.
 */

const { db, TABLES } = require('../db');

const STATUS_MAPPINGS = {
  amazon: {
    'Pending': 'New',
    'Unshipped': 'Processing',
    'PartiallyShipped': 'Processing',
    'Shipped': 'Shipped',
    'Delivered': 'Delivered',
    'DeliveredToCustomer': 'Delivered',
    'Cancelled': 'Cancelled',
    'CustomerReturn': 'Returned',
    'ReturnedToSeller': 'Returned'
  },
  flipkart: {
    'APPROVED': 'New',
    'PLACED': 'New',
    'PACKED': 'Processing',
    'PICKED': 'Processing',
    'READY_TO_DISPATCH': 'Processing',
    'SHIPPED': 'Shipped',
    'IN_TRANSIT': 'Shipped',
    'DELIVERED': 'Delivered',
    'CANCELLED': 'Cancelled',
    'RETURN_REQUESTED': 'Returned',
    'RETURN_RECEIVED': 'Returned'
  },
  meesho: {
    'ORDER_PLACED': 'New',
    'PENDING': 'New',
    'READY_TO_SHIP': 'Processing',
    'PICKUP_PENDING': 'Processing',
    'IN_TRANSIT': 'Shipped',
    'DISPATCHED': 'Shipped',
    'DELIVERED': 'Delivered',
    'CANCELLED': 'Cancelled',
    'RTO': 'Returned',
    'CUSTOMER_RETURN': 'Returned'
  },
  blinkit: {
    'RECEIVED': 'New',
    'CONFIRMED': 'New',
    'ALLOCATED': 'Processing',
    'PICKING': 'Processing',
    'PACKED': 'Processing',
    'OUT_FOR_DELIVERY': 'Shipped',
    'FULFILLED': 'Delivered',
    'DELIVERED': 'Delivered',
    'REJECTED': 'Cancelled',
    'CANCELLED': 'Cancelled',
    'RETURNED_TO_STORE': 'Returned'
  }
};

const COMMON_STATUSES = ['New', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];

class SalesEngine {
  /**
   * Maps marketplace specific raw status to standard common status
   */
  static normalizeOrderStatus(marketplace, rawStatus) {
    if (!rawStatus) return 'New';
    const mkt = marketplace.toLowerCase();
    const map = STATUS_MAPPINGS[mkt] || {};
    return map[rawStatus] || (COMMON_STATUSES.includes(rawStatus) ? rawStatus : 'Processing');
  }

  /**
   * Helper to parse date filter criteria
   * @param {Object} filter { period: 'daily'|'monthly'|'custom', date, month, startDate, endDate }
   */
  static getDateRange(filter = {}) {
    const today = new Date().toISOString().split('T')[0];

    if (filter.period === 'daily') {
      const targetDate = filter.date || today;
      return {
        startDate: `${targetDate}T00:00:00.000Z`,
        endDate: `${targetDate}T23:59:59.999Z`,
        label: `Daily (${targetDate})`
      };
    }

    if (filter.period === 'monthly') {
      let year, month;
      if (filter.month && filter.month.includes('-')) {
        [year, month] = filter.month.split('-').map(Number);
      } else {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      }
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
      const lastDayDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      return {
        startDate: firstDay,
        endDate: lastDayDate.toISOString(),
        label: `Monthly (${year}-${String(month).padStart(2, '0')})`
      };
    }

    if (filter.period === 'custom' && filter.startDate && filter.endDate) {
      return {
        startDate: `${filter.startDate}T00:00:00.000Z`,
        endDate: `${filter.endDate}T23:59:59.999Z`,
        label: `Custom (${filter.startDate} to ${filter.endDate})`
      };
    }

    // Default to last 30 days
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return {
      startDate: d.toISOString(),
      endDate: new Date().toISOString(),
      label: 'Last 30 Days'
    };
  }

  /**
   * Calculates Company Grand Totals & Marketplace Card Aggregations
   * @param {Object} filter Filter params
   * @param {boolean} includeDemo Whether to include demo records
   */
  static getCompanyOverview(filter = {}, includeDemo = true) {
    const { startDate, endDate, label } = this.getDateRange(filter);

    // 1. Fetch Accounts
    const accounts = db.find(TABLES.MARKETPLACE_ACCOUNTS, a => {
      if (!includeDemo && a.isDemo) return false;
      return true;
    });

    const accountMap = new Map(accounts.map(a => [a.id, a]));

    // 2. Fetch Orders in range
    const orders = db.find(TABLES.ORDERS, o => {
      if (!includeDemo && o.isDemo) return false;
      const oDate = o.orderDate;
      return oDate >= startDate && oDate <= endDate;
    });

    // 3. Fetch Settlements in range
    const settlements = db.find(TABLES.SETTLEMENTS, s => {
      if (!includeDemo && s.isDemo) return false;
      const sDate = s.settlementDate;
      return sDate >= startDate && sDate <= endDate;
    });

    // 4. Fetch Bank Transactions in range
    const bankTxns = db.find(TABLES.BANK_TRANSACTIONS, tx => {
      if (!includeDemo && tx.isDemo) return false;
      const tDate = tx.transactionDate;
      return tDate >= startDate && tDate <= endDate;
    });

    // All-time pending settlements (pending settlements are balance sheet obligations, independent of date filter)
    const allPendingSettlements = db.find(TABLES.SETTLEMENTS, s => {
      if (!includeDemo && s.isDemo) return false;
      return s.status === 'pending' || s.status === 'on_hold';
    });

    // Marketplace breakdown buckets
    const marketplaceStats = {
      amazon: this._createMarketplaceBucket('Amazon', 'amazon'),
      flipkart: this._createMarketplaceBucket('Flipkart', 'flipkart'),
      meesho: this._createMarketplaceBucket('Meesho', 'meesho'),
      blinkit: this._createMarketplaceBucket('Blinkit', 'blinkit')
    };

    // Account breakdown buckets
    const accountStats = {};
    for (const acc of accounts) {
      accountStats[acc.id] = {
        accountId: acc.id,
        accountName: acc.accountName,
        marketplace: acc.marketplace,
        sellerId: acc.sellerId,
        connectionStatus: acc.connectionStatus,
        lastSyncAt: acc.lastSyncAt,
        lastError: acc.lastError,
        isDemo: acc.isDemo,
        grossSales: 0,
        netSales: 0,
        totalOrders: 0,
        cancelledOrders: 0,
        returnedOrders: 0,
        totalSettlements: 0,
        settlementPending: 0,
        bankReceipts: 0,
        reconciledAmount: 0,
        unmatchedBankAmount: 0,
        statusCounts: { New: 0, Processing: 0, Shipped: 0, Delivered: 0, Cancelled: 0, Returned: 0 }
      };
    }

    // Aggregate Orders
    let grandGrossSales = 0;
    let grandNetSales = 0;
    let grandTotalOrders = 0;
    let grandCancelledOrders = 0;
    let grandReturnedOrders = 0;
    const grandStatusCounts = { New: 0, Processing: 0, Shipped: 0, Delivered: 0, Cancelled: 0, Returned: 0 };

    for (const order of orders) {
      const mktKey = order.marketplace.toLowerCase();
      const mktBucket = marketplaceStats[mktKey];
      const accBucket = accountStats[order.accountId];

      const normStatus = this.normalizeOrderStatus(order.marketplace, order.rawStatus || order.status);

      const gross = Number(order.grossAmount) || 0;
      let net = Number(order.netAmount) || 0;
      if (order.netAmount === undefined || order.netAmount === null) {
        // Calculate Net = Gross - Cancellations - Returns
        const ded = (Number(order.cancelledAmount) || 0) + (Number(order.refundedAmount) || 0);
        net = Math.max(0, gross - ded);
      }

      grandGrossSales += gross;
      grandNetSales += net;
      grandTotalOrders += 1;
      grandStatusCounts[normStatus] = (grandStatusCounts[normStatus] || 0) + 1;

      if (normStatus === 'Cancelled') grandCancelledOrders += 1;
      if (normStatus === 'Returned') grandReturnedOrders += 1;

      if (mktBucket) {
        mktBucket.grossSales += gross;
        mktBucket.netSales += net;
        mktBucket.totalOrders += 1;
        mktBucket.statusCounts[normStatus] = (mktBucket.statusCounts[normStatus] || 0) + 1;
        if (normStatus === 'Cancelled') mktBucket.cancelledOrders += 1;
        if (normStatus === 'Returned') mktBucket.returnedOrders += 1;
      }

      if (accBucket) {
        accBucket.grossSales += gross;
        accBucket.netSales += net;
        accBucket.totalOrders += 1;
        accBucket.statusCounts[normStatus] = (accBucket.statusCounts[normStatus] || 0) + 1;
        if (normStatus === 'Cancelled') accBucket.cancelledOrders += 1;
        if (normStatus === 'Returned') accBucket.returnedOrders += 1;
      }
    }

    // Aggregate Settlements
    let grandSettlements = 0;
    for (const st of settlements) {
      const mktKey = st.marketplace.toLowerCase();
      const mktBucket = marketplaceStats[mktKey];
      const accBucket = accountStats[st.accountId];
      const payout = Number(st.netPayout) || 0;

      if (st.status === 'disbursed') {
        grandSettlements += payout;
        if (mktBucket) mktBucket.totalSettlements += payout;
        if (accBucket) accBucket.totalSettlements += payout;
      }
    }

    // Aggregate Actual Settlement Pending from all pending settlements
    let grandSettlementPending = 0;
    for (const st of allPendingSettlements) {
      const mktKey = st.marketplace.toLowerCase();
      const mktBucket = marketplaceStats[mktKey];
      const accBucket = accountStats[st.accountId];
      const payout = Number(st.netPayout) || 0;

      grandSettlementPending += payout;
      if (mktBucket) mktBucket.settlementPending += payout;
      if (accBucket) accBucket.settlementPending += payout;
    }

    // Aggregate Bank Transactions
    let grandBankReceipts = 0;
    let grandUnmatchedBankAmount = 0;
    let grandUnmatchedBankTxCount = 0;

    for (const tx of bankTxns) {
      const credit = Number(tx.creditAmount) || 0;
      if (credit <= 0) continue; // Only credit/receipt transactions

      grandBankReceipts += credit;

      // Detect which marketplace this bank credit belongs to based on description / match
      let detectedMkt = null;
      const desc = (tx.description || '').toUpperCase();
      if (desc.includes('AMZN') || desc.includes('AMAZON')) detectedMkt = 'amazon';
      else if (desc.includes('FLIPKART') || desc.includes('FK') || desc.includes('CITIN')) detectedMkt = 'flipkart';
      else if (desc.includes('MEESHO') || desc.includes('FASHNEAR')) detectedMkt = 'meesho';
      else if (desc.includes('BLINKIT') || desc.includes('GROFERS')) detectedMkt = 'blinkit';

      if (tx.reconciliationStatus === 'unmatched') {
        grandUnmatchedBankAmount += credit;
        grandUnmatchedBankTxCount += 1;
      }

      if (detectedMkt && marketplaceStats[detectedMkt]) {
        marketplaceStats[detectedMkt].bankReceipts += credit;
        if (tx.reconciliationStatus === 'matched') {
          marketplaceStats[detectedMkt].reconciledAmount += credit;
        } else {
          marketplaceStats[detectedMkt].unmatchedBankAmount += credit;
        }
      }
    }

    // Map account level bank receipts from matched settlements
    const matchedTxns = db.find(TABLES.BANK_TRANSACTIONS, tx => tx.reconciliationStatus === 'matched' && tx.matchedSettlementId);
    for (const mTx of matchedTxns) {
      const st = db.findById(TABLES.SETTLEMENTS, mTx.matchedSettlementId);
      if (st && accountStats[st.accountId]) {
        accountStats[st.accountId].bankReceipts += (Number(mTx.creditAmount) || 0);
        accountStats[st.accountId].reconciledAmount += (Number(mTx.creditAmount) || 0);
      }
    }

    // Calculate Sales-vs-Received Gap
    const grandSalesReceivedGap = grandNetSales - grandBankReceipts;

    for (const mkt of Object.values(marketplaceStats)) {
      mkt.salesReceivedGap = mkt.netSales - mkt.bankReceipts;
    }

    // Associate account breakdowns into marketplace cards
    for (const acc of Object.values(accountStats)) {
      acc.salesReceivedGap = acc.netSales - acc.bankReceipts;
      const mktKey = acc.marketplace.toLowerCase();
      if (marketplaceStats[mktKey]) {
        marketplaceStats[mktKey].accounts.push(acc);
      }
    }

    return {
      periodInfo: {
        filter,
        startDate,
        endDate,
        label,
        currency: 'INR',
        currencySymbol: '₹'
      },
      grandTotals: {
        grossSales: Math.round(grandGrossSales * 100) / 100,
        netSales: Math.round(grandNetSales * 100) / 100,
        totalOrders: grandTotalOrders,
        cancelledOrders: grandCancelledOrders,
        returnedOrders: grandReturnedOrders,
        totalSettlements: Math.round(grandSettlements * 100) / 100,
        actualBankReceipts: Math.round(grandBankReceipts * 100) / 100,
        salesReceivedGap: Math.round(grandSalesReceivedGap * 100) / 100,
        actualSettlementPending: Math.round(grandSettlementPending * 100) / 100,
        unmatchedBankTransactionsCount: grandUnmatchedBankTxCount,
        unmatchedBankTransactionsAmount: Math.round(grandUnmatchedBankAmount * 100) / 100,
        statusCounts: grandStatusCounts
      },
      marketplaces: Object.values(marketplaceStats),
      allAccounts: Object.values(accountStats),
      explanations: {
        salesGapReason: 'Sales-vs-Received Gap is the difference between revenue earned from customer orders and actual funds credited by marketplaces into Cartman bank accounts for the selected timeframe. The variance is driven by settlement payout cycles (T+7 to T+15), customer return windows, delivery confirmations, and statutory TCS/TDS withholdings.',
        settlementPendingReason: 'Actual Settlement Pending is calculated strictly from marketplace settlement statements representing net payable amounts that have not yet been disbursed. It is NEVER assumed to be simply Sales minus Bank Receipts.'
      }
    };
  }

  static _createMarketplaceBucket(displayName, key) {
    return {
      key,
      displayName,
      grossSales: 0,
      netSales: 0,
      totalOrders: 0,
      cancelledOrders: 0,
      returnedOrders: 0,
      totalSettlements: 0,
      bankReceipts: 0,
      salesReceivedGap: 0,
      settlementPending: 0,
      reconciledAmount: 0,
      unmatchedBankAmount: 0,
      accounts: [],
      statusCounts: { New: 0, Processing: 0, Shipped: 0, Delivered: 0, Cancelled: 0, Returned: 0 }
    };
  }
}

module.exports = SalesEngine;
