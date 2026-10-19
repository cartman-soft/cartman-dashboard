/**
 * Cartman Database Schema Definitions
 * Provides relational integrity constraints, required fields, and index definitions.
 */

const TABLES = {
  USERS: 'users',
  MARKETPLACE_ACCOUNTS: 'marketplace_accounts',
  ORDERS: 'orders',
  SETTLEMENTS: 'settlements',
  BANK_STATEMENTS: 'bank_statements',
  BANK_TRANSACTIONS: 'bank_transactions',
  SYNC_LOGS: 'sync_logs',
  AUDIT_LOGS: 'audit_logs',
  SETTINGS: 'settings'
};

const SCHEMAS = {
  [TABLES.USERS]: {
    required: ['email', 'passwordHash', 'role', 'fullName'],
    unique: ['email'],
    defaults: {
      role: 'Staff',
      status: 'active',
      otpEnabled: true,
      otpSecret: null,
      createdAt: () => new Date().toISOString()
    }
  },

  [TABLES.MARKETPLACE_ACCOUNTS]: {
    required: ['marketplace', 'accountName'],
    unique: ['marketplace', 'accountName'],
    defaults: {
      sellerId: null,
      isVerified: false,
      connectionStatus: 'connected', // connected, disconnected, auth_error, rate_limited
      credentialsJson: '{}',
      lastSyncAt: null,
      lastError: null,
      isDemo: false,
      createdAt: () => new Date().toISOString()
    }
  },

  [TABLES.ORDERS]: {
    required: ['marketplace', 'accountId', 'orderId', 'orderDate', 'status', 'grossAmount'],
    unique: ['marketplace', 'accountId', 'orderId'],
    defaults: {
      rawStatus: '',
      netAmount: 0,
      cancelledAmount: 0,
      refundedAmount: 0,
      taxAmount: 0,
      itemCount: 1,
      currency: 'INR',
      customerCity: '',
      isDemo: true,
      createdAt: () => new Date().toISOString()
    }
  },

  [TABLES.SETTLEMENTS]: {
    required: ['marketplace', 'accountId', 'settlementId', 'settlementDate', 'netPayout'],
    unique: ['marketplace', 'settlementId'],
    defaults: {
      periodStart: null,
      periodEnd: null,
      grossSales: 0,
      commissionFee: 0,
      fixedFee: 0,
      shippingFee: 0,
      refunds: 0,
      taxes: 0,
      status: 'disbursed', // disbursed, pending, on_hold, failed
      bankRefId: '', // UTR / Reference ID from marketplace payout
      isDemo: true,
      createdAt: () => new Date().toISOString()
    }
  },

  [TABLES.BANK_STATEMENTS]: {
    required: ['originalFilename', 'bankName'],
    unique: [],
    defaults: {
      statementPeriod: '',
      totalRecords: 0,
      totalCredits: 0,
      totalDebits: 0,
      status: 'processed',
      uploadedBy: 'system',
      fileChecksum: '',
      createdAt: () => new Date().toISOString()
    }
  },

  [TABLES.BANK_TRANSACTIONS]: {
    required: ['statementId', 'transactionDate', 'creditAmount'],
    unique: [],
    defaults: {
      valueDate: null,
      description: '',
      referenceNo: '',
      utrNo: '',
      debitAmount: 0,
      creditAmount: 0,
      balance: 0,
      reconciliationStatus: 'unmatched', // matched, unmatched, partial, duplicate
      matchedSettlementId: null,
      matchType: null, // exact_utr, exact_amount_date, partial_amount, manual
      matchScore: 0,
      notes: '',
      isDemo: true,
      createdAt: () => new Date().toISOString()
    }
  },

  [TABLES.SYNC_LOGS]: {
    required: ['marketplace', 'accountId', 'syncType', 'status'],
    unique: [],
    defaults: {
      recordsProcessed: 0,
      errorMessage: null,
      startedAt: () => new Date().toISOString(),
      completedAt: null
    }
  },

  [TABLES.AUDIT_LOGS]: {
    required: ['userId', 'action', 'entityType'],
    unique: [],
    defaults: {
      entityId: null,
      detailsJson: '{}',
      createdAt: () => new Date().toISOString()
    }
  },

  [TABLES.SETTINGS]: {
    required: ['key', 'value'],
    unique: ['key'],
    defaults: {
      updatedAt: () => new Date().toISOString()
    }
  }
};

module.exports = {
  TABLES,
  SCHEMAS
};
