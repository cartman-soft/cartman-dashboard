/**
 * Cartman Realistic Seed Generator
 * Populates realistic accounts, orders, settlements, bank transactions, and default users.
 * All demo records are explicitly marked with `isDemo: true`.
 */

const AuthService = require('../auth/authService');
const { db, TABLES } = require('./index');
const { AccountRegistry } = require('../registry/accountRegistry');

function seedDatabase(force = false) {
  // Always ensure the 14 platform-account entries from registry are synchronized
  AccountRegistry.syncRegistryToDb(db);

  // If users already exist and not forced, skip rest of seeding
  if (!force && db.count(TABLES.USERS) > 0) {
    console.log('[SEED] Database contains records. Account registry synchronized.');
    return;
  }

  console.log('[SEED] Seeding database with Cartman marketplace records...');

  // 1. Seed Users with secure password hashing
  const adminPasswordHash = AuthService.hashPassword('CartmanAdmin2026!');
  const accountsPasswordHash = AuthService.hashPassword('CartmanAcc2026!');
  const staffPasswordHash = AuthService.hashPassword('CartmanStaff2026!');

  const userAdmin = db.insert(TABLES.USERS, {
    email: 'admin@cartman.com',
    fullName: 'Rajesh Sharma (Admin)',
    role: 'Admin',
    passwordHash: adminPasswordHash,
    status: 'active',
    otpEnabled: true
  });

  const userAccounts = db.insert(TABLES.USERS, {
    email: 'accounts@cartman.com',
    fullName: 'Pooja Iyer (Accounts Lead)',
    role: 'Accounts',
    passwordHash: accountsPasswordHash,
    status: 'active',
    otpEnabled: true
  });

  const userStaff = db.insert(TABLES.USERS, {
    email: 'staff@cartman.com',
    fullName: 'Vikram Mehta (Operations Staff)',
    role: 'Staff',
    passwordHash: staffPasswordHash,
    status: 'active',
    otpEnabled: true
  });

  // 2. Seed Connected Marketplace Accounts (Multiple accounts per marketplace)
  const accAmazonFba = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
    marketplace: 'amazon',
    accountName: 'Cartman Direct (FBA)',
    sellerId: 'A236NPVTGV8S6Y',
    connectionStatus: 'connected',
    lastSyncAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    lastError: null,
    isDemo: true
  });

  const accAmazonBazaar = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
    marketplace: 'amazon',
    accountName: 'Cartman Bazaar India',
    sellerId: 'A194KJQ88219AZ',
    connectionStatus: 'connected',
    lastSyncAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    lastError: null,
    isDemo: true
  });

  const accFlipkartRetail = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
    marketplace: 'flipkart',
    accountName: 'Cartman Retail Hub',
    sellerId: 'FK_CRT_9921_RTL',
    connectionStatus: 'connected',
    lastSyncAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    lastError: null,
    isDemo: true
  });

  const accFlipkartWholesale = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
    marketplace: 'flipkart',
    accountName: 'Cartman Wholesale Express',
    sellerId: 'FK_CRT_5510_WHL',
    connectionStatus: 'connected',
    lastSyncAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    lastError: null,
    isDemo: true
  });

  const accMeeshoApparel = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
    marketplace: 'meesho',
    accountName: 'Cartman Apparel & Lifestyle',
    sellerId: 'MSH_CRT_APL_01',
    connectionStatus: 'connected',
    lastSyncAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    lastError: null,
    isDemo: true
  });

  const accMeeshoBeauty = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
    marketplace: 'meesho',
    accountName: 'Cartman Beauty & Care',
    sellerId: 'MSH_CRT_BTC_02',
    connectionStatus: 'connected',
    lastSyncAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    lastError: null,
    isDemo: true
  });

  const accBlinkitNcr = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
    marketplace: 'blinkit',
    accountName: 'Cartman QuickCommerce NCR',
    sellerId: 'BLK_CRT_NCR_W01',
    connectionStatus: 'connected',
    lastSyncAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    lastError: null,
    isDemo: true
  });

  const accBlinkitMumbai = db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
    marketplace: 'blinkit',
    accountName: 'Cartman QuickCommerce Mumbai',
    sellerId: 'BLK_CRT_MUM_W02',
    connectionStatus: 'connected',
    lastSyncAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    lastError: null,
    isDemo: true
  });

  const allAccounts = [
    accAmazonFba, accAmazonBazaar,
    accFlipkartRetail, accFlipkartWholesale,
    accMeeshoApparel, accMeeshoBeauty,
    accBlinkitNcr, accBlinkitMumbai
  ];

  // 3. Seed Realistic Orders across the current month and previous weeks
  const today = new Date();
  const statuses = ['Delivered', 'Delivered', 'Delivered', 'Shipped', 'Processing', 'Cancelled', 'Returned'];

  let orderSequence = 1001;
  for (let d = 30; d >= 0; d--) {
    const orderDate = new Date(today);
    orderDate.setDate(today.getDate() - d);
    const dateStr = orderDate.toISOString().split('T')[0];

    for (const acc of allAccounts) {
      // 2 to 5 orders per day per account
      const ordersPerDay = Math.floor(Math.random() * 3) + 2;

      for (let o = 0; o < ordersPerDay; o++) {
        orderSequence++;
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const gross = Math.floor(Math.random() * 3500) + 499; // ₹499 to ₹3999
        let net = gross;
        let cancelledAmount = 0;
        let refundedAmount = 0;

        if (status === 'Cancelled') {
          cancelledAmount = gross;
          net = 0;
        } else if (status === 'Returned') {
          refundedAmount = gross;
          net = 0;
        }

        const prefix = acc.marketplace.substring(0, 3).toUpperCase();
        db.insert(TABLES.ORDERS, {
          marketplace: acc.marketplace,
          accountId: acc.id,
          orderId: `${prefix}-${orderDate.getFullYear()}-${orderSequence}`,
          orderDate: dateStr,
          rawStatus: status,
          status,
          grossAmount: gross,
          netAmount: net,
          cancelledAmount,
          refundedAmount,
          taxAmount: Math.round(gross * 0.18 * 100) / 100,
          currency: 'INR',
          customerCity: ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad', 'Kolkata'][Math.floor(Math.random() * 7)],
          isDemo: true
        });
      }
    }
  }

  // 4. Seed Realistic Marketplace Settlements
  // Batch 1: Amazon FBA - Disbursed
  const stAmz1 = db.insert(TABLES.SETTLEMENTS, {
    marketplace: 'amazon',
    accountId: accAmazonFba.id,
    settlementId: 'SETTL-AMZ-2026-04-A',
    settlementDate: new Date(today.getTime() - 15 * 86400000).toISOString().split('T')[0],
    periodStart: new Date(today.getTime() - 22 * 86400000).toISOString().split('T')[0],
    periodEnd: new Date(today.getTime() - 15 * 86400000).toISOString().split('T')[0],
    grossSales: 168400.00,
    commissionFee: 18524.00,
    fixedFee: 1200.00,
    shippingFee: 2855.50,
    refunds: 0.00,
    taxes: 0.00,
    netPayout: 145820.50,
    status: 'disbursed',
    bankRefId: 'CMS202604159821',
    isDemo: true
  });

  // Batch 2: Flipkart Retail - Disbursed
  const stFk1 = db.insert(TABLES.SETTLEMENTS, {
    marketplace: 'flipkart',
    accountId: accFlipkartRetail.id,
    settlementId: 'SETTL-FK-2026-04-B',
    settlementDate: new Date(today.getTime() - 14 * 86400000).toISOString().split('T')[0],
    periodStart: new Date(today.getTime() - 21 * 86400000).toISOString().split('T')[0],
    periodEnd: new Date(today.getTime() - 14 * 86400000).toISOString().split('T')[0],
    grossSales: 242000.00,
    commissionFee: 24200.00,
    fixedFee: 2100.00,
    shippingFee: 5250.00,
    refunds: 0.00,
    taxes: 0.00,
    netPayout: 210450.00,
    status: 'disbursed',
    bankRefId: 'CITIN2604169912',
    isDemo: true
  });

  // Batch 3: Meesho Apparel - Disbursed
  const stMsh1 = db.insert(TABLES.SETTLEMENTS, {
    marketplace: 'meesho',
    accountId: accMeeshoApparel.id,
    settlementId: 'SETTL-MSH-2026-04-C',
    settlementDate: new Date(today.getTime() - 12 * 86400000).toISOString().split('T')[0],
    periodStart: new Date(today.getTime() - 19 * 86400000).toISOString().split('T')[0],
    periodEnd: new Date(today.getTime() - 12 * 86400000).toISOString().split('T')[0],
    grossSales: 98500.00,
    commissionFee: 4925.00,
    fixedFee: 850.00,
    shippingFee: 3385.00,
    refunds: 0.00,
    taxes: 0.00,
    netPayout: 89340.00,
    status: 'disbursed',
    bankRefId: 'CMS202604183421',
    isDemo: true
  });

  // Batch 4: Blinkit NCR - Disbursed
  const stBlk1 = db.insert(TABLES.SETTLEMENTS, {
    marketplace: 'blinkit',
    accountId: accBlinkitNcr.id,
    settlementId: 'SETTL-BLK-2026-04-D',
    settlementDate: new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0],
    periodStart: new Date(today.getTime() - 17 * 86400000).toISOString().split('T')[0],
    periodEnd: new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0],
    grossSales: 74500.00,
    commissionFee: 8195.00,
    fixedFee: 650.00,
    shippingFee: 1455.00,
    refunds: 0.00,
    taxes: 0.00,
    netPayout: 64200.00,
    status: 'disbursed',
    bankRefId: 'HDFCR2604207812',
    isDemo: true
  });

  // Batch 5: Amazon Bazaar - Disbursed
  const stAmz2 = db.insert(TABLES.SETTLEMENTS, {
    marketplace: 'amazon',
    accountId: accAmazonBazaar.id,
    settlementId: 'SETTL-AMZ-2026-04-E',
    settlementDate: new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0],
    periodStart: new Date(today.getTime() - 12 * 86400000).toISOString().split('T')[0],
    periodEnd: new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0],
    grossSales: 152000.00,
    commissionFee: 15200.00,
    fixedFee: 1100.00,
    shippingFee: 3300.00,
    refunds: 0.00,
    taxes: 0.00,
    netPayout: 132400.00,
    status: 'disbursed',
    bankRefId: 'CMS202604257712',
    isDemo: true
  });

  // Batch 6: Flipkart Wholesale - ACTUAL SETTLEMENT PENDING
  db.insert(TABLES.SETTLEMENTS, {
    marketplace: 'flipkart',
    accountId: accFlipkartWholesale.id,
    settlementId: 'SETTL-FK-PENDING-01',
    settlementDate: new Date(today.getTime() - 2 * 86400000).toISOString().split('T')[0],
    periodStart: new Date(today.getTime() - 9 * 86400000).toISOString().split('T')[0],
    periodEnd: new Date(today.getTime() - 2 * 86400000).toISOString().split('T')[0],
    grossSales: 118000.00,
    commissionFee: 11800.00,
    fixedFee: 950.00,
    shippingFee: 2450.00,
    refunds: 0.00,
    taxes: 0.00,
    netPayout: 102800.00,
    status: 'pending',
    bankRefId: '',
    isDemo: true
  });

  // Batch 7: Meesho Beauty - ACTUAL SETTLEMENT PENDING
  db.insert(TABLES.SETTLEMENTS, {
    marketplace: 'meesho',
    accountId: accMeeshoBeauty.id,
    settlementId: 'SETTL-MSH-PENDING-02',
    settlementDate: new Date(today.getTime() - 1 * 86400000).toISOString().split('T')[0],
    periodStart: new Date(today.getTime() - 8 * 86400000).toISOString().split('T')[0],
    periodEnd: new Date(today.getTime() - 1 * 86400000).toISOString().split('T')[0],
    grossSales: 54000.00,
    commissionFee: 2700.00,
    fixedFee: 500.00,
    shippingFee: 1800.00,
    refunds: 0.00,
    taxes: 0.00,
    netPayout: 49000.00,
    status: 'pending',
    bankRefId: '',
    isDemo: true
  });

  // Batch 8: Blinkit Mumbai - ON HOLD (Compliance review)
  db.insert(TABLES.SETTLEMENTS, {
    marketplace: 'blinkit',
    accountId: accBlinkitMumbai.id,
    settlementId: 'SETTL-BLK-HOLD-03',
    settlementDate: new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0],
    periodStart: new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0],
    periodEnd: new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0],
    grossSales: 41000.00,
    commissionFee: 4510.00,
    fixedFee: 400.00,
    shippingFee: 890.00,
    refunds: 0.00,
    taxes: 0.00,
    netPayout: 35200.00,
    status: 'on_hold',
    bankRefId: '',
    isDemo: true
  });

  // 5. Seed Bank Statements & Normalized Bank Transactions
  const bankStmt = db.insert(TABLES.BANK_STATEMENTS, {
    originalFilename: 'HDFC_Current_Account_April_2026.xlsx',
    bankName: 'HDFC Bank Corporate Current A/C (..4902)',
    statementPeriod: '01-Apr-2026 to 30-Apr-2026',
    totalRecords: 6,
    totalCredits: 687210.50,
    totalDebits: 15000.00,
    status: 'processed',
    uploadedBy: userAccounts.fullName,
    fileChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  });

  // Tx 1: Matched with Amazon FBA Settlement (Exact UTR Match)
  db.insert(TABLES.BANK_TRANSACTIONS, {
    statementId: bankStmt.id,
    transactionDate: new Date(today.getTime() - 15 * 86400000).toISOString().split('T')[0],
    description: 'CMS/AMAZON SELLER SERVICES/SETTL-AMZ-2026-04-A',
    referenceNo: 'CMS202604159821',
    utrNo: 'CMS202604159821',
    debitAmount: 0.00,
    creditAmount: 145820.50,
    balance: 845820.50,
    reconciliationStatus: 'matched',
    matchedSettlementId: stAmz1.id,
    matchType: 'exact_utr',
    matchScore: 100,
    notes: 'Auto-reconciled with Amazon Settlement SETTL-AMZ-2026-04-A via exact UTR.',
    isDemo: true
  });

  // Tx 2: Matched with Flipkart Retail (Exact UTR Match)
  db.insert(TABLES.BANK_TRANSACTIONS, {
    statementId: bankStmt.id,
    transactionDate: new Date(today.getTime() - 14 * 86400000).toISOString().split('T')[0],
    description: 'NEFT-FLIPKART INTERNET PVT LTD-SETTL-FK-2026-04-B',
    referenceNo: 'CITIN2604169912',
    utrNo: 'CITIN2604169912',
    debitAmount: 0.00,
    creditAmount: 210450.00,
    balance: 1056270.50,
    reconciliationStatus: 'matched',
    matchedSettlementId: stFk1.id,
    matchType: 'exact_utr',
    matchScore: 100,
    notes: 'Auto-reconciled with Flipkart Settlement SETTL-FK-2026-04-B via exact NEFT UTR.',
    isDemo: true
  });

  // Tx 3: Matched with Meesho (Exact Narration Match)
  db.insert(TABLES.BANK_TRANSACTIONS, {
    statementId: bankStmt.id,
    transactionDate: new Date(today.getTime() - 12 * 86400000).toISOString().split('T')[0],
    description: 'CMS/FASHNEAR TECHNOLOGIES-MEESHO-SETTL-MSH-2026-04-C',
    referenceNo: 'CMS202604183421',
    utrNo: 'CMS202604183421',
    debitAmount: 0.00,
    creditAmount: 89340.00,
    balance: 1145610.50,
    reconciliationStatus: 'matched',
    matchedSettlementId: stMsh1.id,
    matchType: 'exact_utr',
    matchScore: 100,
    notes: 'Auto-reconciled with Meesho Settlement SETTL-MSH-2026-04-C via UTR.',
    isDemo: true
  });

  // Tx 4: Matched with Blinkit NCR
  db.insert(TABLES.BANK_TRANSACTIONS, {
    statementId: bankStmt.id,
    transactionDate: new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0],
    description: 'RTGS-BLINKIT COMMERCE PVT LTD-SETTL-BLK-2026-04-D',
    referenceNo: 'HDFCR2604207812',
    utrNo: 'HDFCR2604207812',
    debitAmount: 0.00,
    creditAmount: 64200.00,
    balance: 1209810.50,
    reconciliationStatus: 'matched',
    matchedSettlementId: stBlk1.id,
    matchType: 'exact_utr',
    matchScore: 100,
    notes: 'Auto-reconciled with Blinkit Settlement SETTL-BLK-2026-04-D.',
    isDemo: true
  });

  // Tx 5: Matched with Amazon Bazaar
  db.insert(TABLES.BANK_TRANSACTIONS, {
    statementId: bankStmt.id,
    transactionDate: new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0],
    description: 'CMS/AMAZON SELLER SERVICES/SETTL-AMZ-2026-04-E',
    referenceNo: 'CMS202604257712',
    utrNo: 'CMS202604257712',
    debitAmount: 0.00,
    creditAmount: 132400.00,
    balance: 1327210.50,
    reconciliationStatus: 'matched',
    matchedSettlementId: stAmz2.id,
    matchType: 'exact_utr',
    matchScore: 100,
    notes: 'Auto-reconciled with Amazon Settlement SETTL-AMZ-2026-04-E.',
    isDemo: true
  });

  // Tx 6: Unmatched Bank Credit (Direct marketplace transfer or unmapped adjustment)
  db.insert(TABLES.BANK_TRANSACTIONS, {
    statementId: bankStmt.id,
    transactionDate: new Date(today.getTime() - 1 * 86400000).toISOString().split('T')[0],
    description: 'CMS/AMAZON PAY INDIA DIRECT CREDIT/REF-AMZ-998124',
    referenceNo: 'CMS202604289981',
    utrNo: 'CMS202604289981',
    debitAmount: 0.00,
    creditAmount: 45000.00,
    balance: 1372210.50,
    reconciliationStatus: 'unmatched',
    matchedSettlementId: null,
    matchType: null,
    matchScore: 0,
    notes: 'Awaiting settlement report batch upload from Amazon Seller Central.',
    isDemo: true
  });

  console.log('[SEED] Cartman database populated successfully with multi-marketplace records.');
}

module.exports = { seedDatabase };
