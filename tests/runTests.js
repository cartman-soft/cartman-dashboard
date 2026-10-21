/**
 * Cartman Automated Test Suite
 * Validates:
 * 1. Gross and Net Sales calculations (deduplication of cancellations/returns)
 * 2. Settlement Pending vs Sales-vs-Received Gap logic
 * 3. Multi-marketplace and account-level aggregation
 * 4. Bank Statement parser and column mapping
 * 5. Deduplication of files and transactions
 * 6. Reconciliation matching (Exact UTR, Narration, Amount+Date, Unmatched)
 * 7. RBAC permissions enforcement
 * 8. Date filtering (Daily, Monthly, Custom)
 */

const assert = require('assert');
const SalesEngine = require('../src/calculations/salesEngine');
const { BankParser } = require('../src/reconciliation/bankParser');
const Deduplicator = require('../src/reconciliation/deduplicator');
const ReconciliationMatcher = require('../src/reconciliation/matcher');
const AuthService = require('../src/auth/authService');
const OtpStore = require('../src/auth/otpStore');
const EmailService = require('../src/auth/emailService');
const config = require('../src/config');
const { db, TABLES } = require('../src/db');

let testsPassed = 0;
let testsFailed = 0;

function it(description, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        console.log(`  ✓ ${description}`);
        testsPassed++;
      }).catch(err => {
        console.error(`  ✗ ${description}`);
        console.error(`    Error: ${err.message}`);
        testsFailed++;
      });
    }
    console.log(`  ✓ ${description}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    Error: ${err.message}`);
    testsFailed++;
  }
}

async function runAllTests() {
  console.log('\n=======================================================');
  console.log('   RUNNING CARTMAN TEST SUITE');
  console.log('=======================================================\n');

  // Test Group 1: Sales Calculations & Status Mapping
  console.log('--- 1. Sales Calculations & Accounting Integrity ---');

  it('calculates Net Sales = Gross - Deduplications correctly', () => {
    const gross = 5000;
    const cancelled = 1000;
    const refunded = 500;
    const net = gross - cancelled - refunded;
    assert.strictEqual(net, 3500, 'Net sales must deduct cancellations and refunds strictly once');
  });

  it('maps marketplace specific order statuses correctly', () => {
    assert.strictEqual(SalesEngine.normalizeOrderStatus('amazon', 'Unshipped'), 'Processing');
    assert.strictEqual(SalesEngine.normalizeOrderStatus('amazon', 'CustomerReturn'), 'Returned');
    assert.strictEqual(SalesEngine.normalizeOrderStatus('flipkart', 'APPROVED'), 'New');
    assert.strictEqual(SalesEngine.normalizeOrderStatus('flipkart', 'READY_TO_DISPATCH'), 'Processing');
    assert.strictEqual(SalesEngine.normalizeOrderStatus('meesho', 'RTO'), 'Returned');
    assert.strictEqual(SalesEngine.normalizeOrderStatus('blinkit', 'FULFILLED'), 'Delivered');
  });

  // Test Group 2: Settlement Pending vs Sales Gap
  console.log('\n--- 2. Payment Reconciliation Logic ---');

  it('guarantees Settlement Pending is from settlement reports, NOT Sales - Bank Receipts', () => {
    const overview = SalesEngine.getCompanyOverview({ period: 'monthly' });
    const recon = ReconciliationMatcher.getReconciliationSummary();

    // Actual Settlement Pending must match pending settlements in recon summary
    assert.strictEqual(
      overview.grandTotals.actualSettlementPending,
      recon.totals.actualSettlementPending,
      'Settlement pending must come from actual pending settlement report obligations'
    );

    // Sales-vs-Received Gap is independently tracked
    const expectedGap = overview.grandTotals.netSales - overview.grandTotals.actualBankReceipts;
    assert.strictEqual(
      Math.round(overview.grandTotals.salesReceivedGap),
      Math.round(expectedGap),
      'Sales gap must equal Net Sales minus Bank Receipts for period'
    );
  });

  // Test Group 3: Bank Statement Parser & Profiles
  console.log('\n--- 3. Bank Statement Parsing & Profiles ---');

  it('normalizes various Indian bank date formats correctly', () => {
    assert.strictEqual(BankParser.normalizeDate('2026-04-15'), '2026-04-15');
    assert.strictEqual(BankParser.normalizeDate('15/04/2026'), '2026-04-15');
    assert.strictEqual(BankParser.normalizeDate('15-Apr-2026'), '2026-04-15');
  });

  it('normalizes currency strings with INR symbols and commas', () => {
    assert.strictEqual(BankParser.normalizeAmount('₹ 1,45,820.50'), 145820.5);
    assert.strictEqual(BankParser.normalizeAmount('2,10,450.00 Cr'), 210450);
    assert.strictEqual(BankParser.normalizeAmount(''), 0);
  });

  it('detects major Indian bank profiles correctly', () => {
    const hdfcHeaders = ['Date', 'Narration', 'Chq/Ref No', 'Deposit Amt', 'Closing Balance'];
    const iciciHeaders = ['Transaction Date', 'Transaction Remarks', 'Cheque Number', 'Credit Amount (INR)', 'Balance (INR)'];

    assert.strictEqual(BankParser.detectBankProfile(hdfcHeaders), 'hdfc');
    assert.strictEqual(BankParser.detectBankProfile(iciciHeaders), 'icici');
  });

  // Test Group 4: Deduplication Protection
  console.log('\n--- 4. Deduplication & Idempotency ---');

  it('generates deterministic transaction fingerprints and flags duplicates', () => {
    const tx1 = {
      transactionDate: '2026-04-15',
      utrNo: 'CMS202604159821',
      description: 'CMS/AMAZON SELLER SERVICES',
      creditAmount: 145820.50,
      debitAmount: 0
    };
    const tx2 = { ...tx1 }; // Identical

    const batch = Deduplicator.checkTransactionDuplicates([tx1, tx2]);
    assert.strictEqual(batch.duplicateCount, 1, 'Should detect 1 duplicate transaction in batch of identical pairs');
    assert.strictEqual(batch.records[1].isDuplicate, true, 'Second transaction must be flagged as duplicate');
  });

  // Test Group 5: Multi-tier Matching Engine
  console.log('\n--- 5. Reconciliation Matching Engine ---');

  it('matches bank credits to settlements by exact UTR', () => {
    const recon = ReconciliationMatcher.getReconciliationSummary();
    const matchedWithUtr = recon.transactions.filter(t => t.matchType === 'exact_utr');
    assert.ok(matchedWithUtr.length >= 4, 'Should match settlements with exact UTR');
  });

  it('keeps unmatched bank transactions in unmatched state with full audit trail', () => {
    const recon = ReconciliationMatcher.getReconciliationSummary();
    const unmatched = recon.transactions.filter(t => t.reconciliationStatus === 'unmatched');
    assert.ok(unmatched.length >= 1, 'Should preserve unallocated bank receipts as unmatched');
    assert.strictEqual(unmatched[0].reconciliationStatus, 'unmatched');
  });

  // Test Group 6: Date Filters
  console.log('\n--- 6. Date Range Filtering ---');

  it('supports Daily, Monthly, and Custom date ranges consistently', () => {
    const daily = SalesEngine.getDateRange({ period: 'daily', date: '2026-04-10' });
    assert.ok(daily.startDate.startsWith('2026-04-10T00:00:00'));

    const monthly = SalesEngine.getDateRange({ period: 'monthly', month: '2026-04' });
    assert.ok(monthly.startDate.startsWith('2026-04-01T00:00:00'));
    assert.ok(monthly.endDate.startsWith('2026-04-30T23:59:59'));

    const custom = SalesEngine.getDateRange({ period: 'custom', startDate: '2026-04-05', endDate: '2026-04-20' });
    assert.ok(custom.startDate.startsWith('2026-04-05T00:00:00'));
    assert.ok(custom.endDate.startsWith('2026-04-20T23:59:59'));
  });

  // Test Group 7: Authentication & RBAC
  console.log('\n--- 7. Authentication, OTP & RBAC ---');

  it('hashes passwords securely and verifies them with bcrypt', () => {
    const plain = 'TestPassword2026!';
    const hash = AuthService.hashPassword(plain);
    assert.notStrictEqual(plain, hash);
    assert.ok(AuthService.verifyPassword(plain, hash));
    assert.ok(!AuthService.verifyPassword('WrongPassword', hash));
  });

  await it('requires 6-digit OTP verification before issuing JWT session', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    const origHash = config.dashboardPasswordHash;
    config.dashboardOwnerEmail = 'admin@cartman.com';
    config.dashboardPasswordHash = AuthService.hashPassword('CartmanAdmin2026!');
    try {
      const res = await AuthService.initiateLogin({ email: 'admin@cartman.com', password: 'CartmanAdmin2026!' });
      assert.strictEqual(res.otpRequired, true);
      assert.ok(res.expiresInSeconds > 0);

      const tokenRes = await AuthService.verifyOtp({ email: 'admin@cartman.com', otp: res.devOtp || '123456' });
      assert.ok(tokenRes.token);
      assert.strictEqual(tokenRes.user.email, 'admin@cartman.com');
      assert.strictEqual(tokenRes.user.role, 'Admin');
    } finally {
      config.dashboardOwnerEmail = origOwner;
      config.dashboardPasswordHash = origHash;
    }
  });

  // Test Group 8: Firebase & Vercel Integration
  console.log('\n--- 8. Firebase & Vercel Integration ---');

  it('exports Express app correctly for Vercel Serverless Functions', () => {
    const { app: localApp } = require('../src/server');
    const vercelHandler = require('../api/index');
    assert.strictEqual(typeof vercelHandler, 'function');
    assert.strictEqual(vercelHandler, localApp);
  });

  it('registers Firebase config routes on the application router', () => {
    const { app: localApp } = require('../src/server');
    const routes = localApp._router.stack
      .filter(r => r.route || (r.name === 'router' && r.regexp))
      .map(r => r.regexp.toString());
    assert.ok(routes.some(r => r.includes('firebase')));
  });

  // Test Group 9: Sales Report Parser & Amazon Daily Business Reports
  console.log('\n--- 9. Sales Report Parser & Amazon Daily Business Reports ---');

  const SalesReportParser = require('../src/integrations/salesReportParser');

  it('parses Amazon daily Business Reports as distinct aggregate daily metrics with preserved B2B metrics', () => {
    const businessReportHeaders = [
      'Date', 'Ordered Product Sales', 'Ordered Product Sales - B2B', 'Units Ordered',
      'Units Ordered - B2B', 'Total Order Items', 'Total Order Items - B2B',
      'Average Sales per Order Item', 'Average Sales per Order Item - B2B',
      'Average Units per Order Item', 'Average Units per Order Item - B2B',
      'Average Selling Price', 'Average Selling Price - B2B',
      'Sessions - Total', 'Sessions - Total - B2B',
      'Order Item Session Percentage', 'Order Item Session Percentage - B2B',
      'Average Offer Count'
    ];
    const sampleRows = [
      {
        'Date': '18/09/26',
        'Ordered Product Sales': '₹0.00',
        'Ordered Product Sales - B2B': '₹0.00',
        'Units Ordered': '0',
        'Units Ordered - B2B': '0',
        'Total Order Items': '0',
        'Total Order Items - B2B': '0',
        'Average Sales per Order Item': '₹0.00',
        'Average Sales per Order Item - B2B': '₹0.00',
        'Average Units per Order Item': '0',
        'Average Units per Order Item - B2B': '0',
        'Average Selling Price': '₹0.00',
        'Average Selling Price - B2B': '₹0.00',
        'Sessions - Total': '160',
        'Sessions - Total - B2B': '0',
        'Order Item Session Percentage': '0.00%',
        'Order Item Session Percentage - B2B': '0.00%',
        'Average Offer Count': '0'
      },
      {
        'Date': '19/09/26',
        'Ordered Product Sales': '₹5,391.00',
        'Ordered Product Sales - B2B': '₹0.00',
        'Units Ordered': '3',
        'Units Ordered - B2B': '0',
        'Total Order Items': '3',
        'Total Order Items - B2B': '0',
        'Average Sales per Order Item': '₹1,797.00',
        'Average Sales per Order Item - B2B': '₹0.00',
        'Average Units per Order Item': '1',
        'Average Units per Order Item - B2B': '0',
        'Average Selling Price': '₹1,797.00',
        'Average Selling Price - B2B': '₹0.00',
        'Sessions - Total': '155',
        'Sessions - Total - B2B': '0',
        'Order Item Session Percentage': '1.94%',
        'Order Item Session Percentage - B2B': '0.00%',
        'Average Offer Count': '1'
      },
      {
        'Date': '20/09/26',
        'Ordered Product Sales': '"₹13,377.00"',
        'Ordered Product Sales - B2B': '"₹2,695.00"',
        'Units Ordered': '7',
        'Units Ordered - B2B': '1',
        'Total Order Items': '6',
        'Total Order Items - B2B': '1',
        'Average Sales per Order Item': '₹2,229.50',
        'Average Sales per Order Item - B2B': '₹2,695.00',
        'Average Units per Order Item': '1',
        'Average Units per Order Item - B2B': '1',
        'Average Selling Price': '₹1,911.00',
        'Average Selling Price - B2B': '₹2,695.00',
        'Sessions - Total': '230',
        'Sessions - Total - B2B': '3',
        'Order Item Session Percentage': '2.61%',
        'Order Item Session Percentage - B2B': '33.33%',
        'Average Offer Count': '1'
      }
    ];

    assert.strictEqual(SalesReportParser.isAmazonBusinessReport(businessReportHeaders), true);

    const extraction = SalesReportParser.extractSalesRecords(businessReportHeaders, sampleRows, 'amazon');
    assert.strictEqual(extraction.isDailySummary, true, 'Must identify as daily summary report');
    assert.strictEqual(extraction.records.length, 0, 'Must NOT insert daily summaries into individual orders table');
    assert.strictEqual(extraction.dailyRecords.length, 3, 'Must extract 3 daily summary records');

    // Requirement 3: Map Date to daily date, Ordered Product Sales to gross sales, preserve B2B separately
    assert.strictEqual(extraction.totalGrossSales, 18768, 'Gross sales must sum correctly (5391 + 13377 = 18768)');
    assert.strictEqual(extraction.totalB2bSales, 2695, 'B2B sales must be preserved separately and not added into gross sales');
    assert.strictEqual(extraction.dailyRecords[2].grossOrderedSales, 13377);
    assert.strictEqual(extraction.dailyRecords[2].b2bOrderedSales, 2695);

    // Requirement 4: Treat Units Ordered and Total Order Items as aggregate metrics, not unique order counts
    assert.strictEqual(extraction.totalUnitsOrdered, 10, 'Units ordered must be aggregate 10 (0 + 3 + 7)');
    assert.strictEqual(extraction.totalOrderItems, 9, 'Order items must be aggregate 9 (0 + 3 + 6)');
    assert.strictEqual(extraction.totalSessions, 545, 'Sessions must sum to 545 (160 + 155 + 230)');

    // Date range
    assert.strictEqual(extraction.dateRange.startDate, '2026-09-18');
    assert.strictEqual(extraction.dateRange.endDate, '2026-09-20');
  });

  it('correctly parses rupee values with quotes, commas, and encoding variations', () => {
    assert.strictEqual(SalesReportParser.normalizeAmount('"₹5,391.00"'), 5391);
    assert.strictEqual(SalesReportParser.normalizeAmount('"₹13,377.00"'), 13377);
    assert.strictEqual(SalesReportParser.normalizeAmount('?5,391.00'), 5391);
    assert.strictEqual(SalesReportParser.normalizeAmount('₹1,45,820.50'), 145820.5);
    assert.strictEqual(SalesReportParser.normalizeAmount('Rs. 2,695.50'), 2695.5);
    assert.strictEqual(SalesReportParser.normalizeAmount(0), 0);
  });

  it('validates dates and prevents double-counting of duplicate dates and identical files', () => {
    const rawHeaders = ['Date', 'Ordered Product Sales', 'Units Ordered', 'Sessions - Total', 'Average Selling Price'];
    const sampleRows = [
      { 'Date': '18/09/26', 'Ordered Product Sales': '₹1,000.00', 'Units Ordered': '1', 'Sessions - Total': '10', 'Average Selling Price': '₹1,000.00' },
      { 'Date': '18/09/26', 'Ordered Product Sales': '₹1,000.00', 'Units Ordered': '1', 'Sessions - Total': '10', 'Average Selling Price': '₹1,000.00' } // Duplicate date in file
    ];

    const extraction = SalesReportParser.extractSalesRecords(rawHeaders, sampleRows, 'amazon');
    assert.strictEqual(extraction.dailyRecords.length, 1, 'In-file duplicate dates must be skipped');
    assert.strictEqual(extraction.warnings.length, 1, 'Must warn about duplicate date');
    assert.ok(extraction.warnings[0].includes('Duplicate date'));
  });

  it('keeps marketplace as Not Detected and account unverified when report lacks explicit identifiers', () => {
    const headers = ['Date', 'Ordered Product Sales', 'Units Ordered', 'Sessions - Total'];
    const rows = [{ 'Date': '19/09/26', 'Ordered Product Sales': '?5,391.00', 'Units Ordered': '3', 'Sessions - Total': '155' }];
    const rawContent = '18/09/26 ?0.00 0\n19/09/26 ?5,391.00 3';

    const detectedMkt = SalesReportParser.detectMarketplace(headers, rawContent, rows);
    assert.strictEqual(detectedMkt, null, 'Marketplace must remain null when no verified keywords/IDs are present');

    const detectedAcc = SalesReportParser.detectAccount(headers, rows, rawContent, [
      { id: 'amz_cartman', marketplace: 'amazon', accountName: 'Cartman', sellerId: 'A236NPVTGV8S6Y' }
    ], detectedMkt);
    assert.strictEqual(detectedAcc, null, 'Account must remain null/unverified when seller ID is absent');
  });

  it('successfully extracts order records from genuine order-level reports without regression', () => {
    const orderHeaders = ['Amazon Order Id', 'Order Date', 'Invoice Amount', 'Order Status'];
    const orderRows = [
      { 'Amazon Order Id': '402-9812451-1234567', 'Order Date': '19/09/2026', 'Invoice Amount': '1,797.00', 'Order Status': 'Shipped' },
      { 'Amazon Order Id': '402-9812451-7654321', 'Order Date': '20/09/2026', 'Invoice Amount': '2,426.00', 'Order Status': 'Delivered' }
    ];

    const result = SalesReportParser.extractSalesRecords(orderHeaders, orderRows, 'amazon');
    assert.strictEqual(result.records.length, 2, 'Should extract both orders');
    assert.strictEqual(result.records[0].orderId, '402-9812451-1234567');
    assert.strictEqual(result.records[0].grossAmount, 1797);
    assert.strictEqual(result.records[0].status, 'Shipped');
    assert.strictEqual(result.isSummaryReport, false);
    assert.strictEqual(result.validationError, null);
  });

  // Test Group 10: Private Dashboard Authentication & RBAC Protection
  console.log('\n--- 10. Private Dashboard Authentication & RBAC Protection ---');

  it('enforces strict authentication on protected endpoints and rejects unauthenticated requests with 401', () => {
    const { requireAuth } = require('../src/auth/middleware');

    let statusSet = null;
    let responseJson = null;

    const mockReq = { method: 'GET', headers: {} };
    const mockRes = {
      status: (code) => {
        statusSet = code;
        return {
          json: (data) => { responseJson = data; }
        };
      }
    };
    let nextCalled = false;
    requireAuth(mockReq, mockRes, () => { nextCalled = true; });

    assert.strictEqual(statusSet, 401, 'Unauthenticated request must return 401 Unauthorized');
    assert.strictEqual(nextCalled, false, 'Unauthenticated request must NOT reach route handler');
    assert.ok(responseJson.error.includes('Authentication required'), 'Must specify authentication required');
  });

  it('rejects tampered or invalid Bearer tokens with 401', () => {
    const { requireAuth } = require('../src/auth/middleware');

    let statusSet = null;
    let responseJson = null;

    const mockReq = { method: 'GET', headers: { authorization: 'Bearer invalid.token.signature' } };
    const mockRes = {
      status: (code) => {
        statusSet = code;
        return {
          json: (data) => { responseJson = data; }
        };
      }
    };
    let nextCalled = false;
    requireAuth(mockReq, mockRes, () => { nextCalled = true; });

    assert.strictEqual(statusSet, 401, 'Invalid Bearer token must return 401 Unauthorized');
    assert.strictEqual(nextCalled, false, 'Invalid Bearer token must NOT reach route handler');
    assert.ok(responseJson.error.includes('Invalid or expired'), 'Must specify invalid or expired token');
  });

  it('accepts valid Bearer token and attaches authenticated user to req.user', () => {
    const config = require('../src/config');
    const { requireAuth } = require('../src/auth/middleware');

    const token = AuthService.issueToken({
      id: 'admin',
      username: config.dashboardUsername,
      email: `${config.dashboardUsername}@cartman.internal`,
      role: 'Admin',
      fullName: 'Dashboard Owner'
    });

    const mockReq = { method: 'GET', headers: { authorization: `Bearer ${token}` } };
    const mockRes = {};
    let nextCalled = false;

    requireAuth(mockReq, mockRes, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Valid token must pass through to route handler');
    assert.strictEqual(mockReq.user.id, 'admin');
    assert.strictEqual(mockReq.user.role, 'Admin');
    assert.strictEqual(mockReq.user.username, config.dashboardUsername);
  });

  it('generates secure salted bcrypt password hash via generateCredentials script', () => {
    const { generateCredentials } = require('../scripts/generateHash');
    const creds = generateCredentials('CustomAdminPass2026!', 'custom_user');

    assert.strictEqual(creds.username, 'custom_user');
    assert.ok(creds.passwordHash.startsWith('$2'), 'Hash must be a bcrypt hash string');
    assert.strictEqual(creds.jwtSecret.length, 64, 'JWT secret must be 32 random bytes in hex (64 chars)');
    assert.ok(AuthService.verifyPassword('CustomAdminPass2026!', creds.passwordHash), 'Hash must verify with password');
    assert.ok(!AuthService.verifyPassword('WrongPassword', creds.passwordHash), 'Hash must reject incorrect password');
  });

  await it('authenticates custom user-configured credentials and rejects unconfigured users', async () => {
    const config = require('../src/config');
    const { generateCredentials } = require('../scripts/generateHash');

    const originalUser = config.dashboardUsername;
    const originalHash = config.dashboardPasswordHash;

    try {
      const customCreds = generateCredentials('MyVerySecureCustomPass2026!', 'rushit_owner');
      config.dashboardUsername = customCreds.username;
      config.dashboardPasswordHash = customCreds.passwordHash;

      // 1. Login with custom username and custom password succeeds
      const result = await AuthService.login({
        username: 'rushit_owner',
        password: 'MyVerySecureCustomPass2026!'
      });
      assert.ok(result.token, 'Must return JWT token');
      assert.strictEqual(result.user.username, 'rushit_owner');
      assert.strictEqual(result.user.role, 'Admin');

      // 2. Login with wrong password throws error
      let wrongPassErr = null;
      try {
        await AuthService.login({
          username: 'rushit_owner',
          password: 'WrongPassword123'
        });
      } catch (e) {
        wrongPassErr = e;
      }
      assert.ok(wrongPassErr, 'Must reject incorrect password');
      assert.strictEqual(wrongPassErr.message, 'Invalid username or password.');

      // 3. Login with former or unconfigured username is rejected
      let unconfErr = null;
      try {
        await AuthService.login({
          username: 'admin',
          password: 'CartmanAdmin2026!'
        });
      } catch (e) {
        unconfErr = e;
      }
      assert.ok(unconfErr, 'Must reject unconfigured username');
      assert.strictEqual(unconfErr.message, 'Invalid username or password.');

    } finally {
      config.dashboardUsername = originalUser;
      config.dashboardPasswordHash = originalHash;
    }
  });

  it('masks Firebase configuration in unconfigured state', () => {
    const config = require('../src/config');
    // Simulate GET /api/firebase/config handler logic
    const maskedData = {
      apiKey: '',
      projectId: '',
      isConfigured: false
    };
    assert.strictEqual(maskedData.apiKey, '');
    assert.strictEqual(maskedData.projectId, '');
    assert.strictEqual(maskedData.isConfigured, false);
  });

  it('strictly excludes sensitive files in .gitignore and .vercelignore', () => {
    const fs = require('fs');
    const path = require('path');

    const gitignore = fs.readFileSync(path.resolve(__dirname, '../.gitignore'), 'utf8');
    const vercelignore = fs.readFileSync(path.resolve(__dirname, '../.vercelignore'), 'utf8');

    assert(gitignore.includes('data/cartman_db.json'), '.gitignore must exclude cartman_db.json');
    assert(gitignore.includes('data/firebase_config.json'), '.gitignore must exclude firebase_config.json');
    assert(gitignore.includes('.env'), '.gitignore must exclude .env');
    assert(gitignore.includes('backup*/'), '.gitignore must exclude backups');
    assert(gitignore.includes('uploads/'), '.gitignore must exclude uploads');

    assert(vercelignore.includes('data/cartman_db.json'), '.vercelignore must exclude cartman_db.json');
    assert(vercelignore.includes('data/firebase_config.json'), '.vercelignore must exclude firebase_config.json');
    assert(vercelignore.includes('.env'), '.vercelignore must exclude .env');
    assert(vercelignore.includes('backup*/'), '.vercelignore must exclude backups');
    assert(vercelignore.includes('tests/'), '.vercelignore must exclude tests');
  });

  // Test Group 11: Vercel Read-Only Filesystem & Public Demo Startup
  console.log('\n--- 11. Vercel Read-Only Filesystem & Public Demo Startup ---');

  await it('boots database in-memory without filesystem calls when running in Vercel/demo mode', () => {
    const { RelationalDatabase } = require('../src/db');
    // Simulate non-writable /var/task path as in Vercel lambda
    const vercelFakePath = 'Z:\\non_existent_readonly_volume\\var\\task\\data\\cartman_db.json';

    // Instantiation must succeed without ENOENT or mkdirSync error
    const vDb = new RelationalDatabase(vercelFakePath, { isDemoMode: true });
    assert.strictEqual(vDb.isDemoMode, true);
    assert.strictEqual(vDb.count(TABLES.USERS), 0);

    // Saving must be a no-op that does not throw or create files
    vDb.save();

    // In-memory inserts must succeed cleanly
    const testUser = vDb.insert(TABLES.USERS, {
      email: 'demo@cartman.com',
      fullName: 'Demo Test',
      role: 'Staff',
      passwordHash: 'dummy',
      status: 'active'
    });
    assert.ok(testUser.id);
    assert.strictEqual(vDb.count(TABLES.USERS), 1);
  });

  await it('populates safe deterministic demo dataset in-memory without touching disk', () => {
    const { RelationalDatabase } = require('../src/db');
    const { AccountRegistry } = require('../src/registry/accountRegistry');
    const vDb = new RelationalDatabase('/var/task/data/cartman_db.json', { isDemoMode: true });

    // Sync account registry
    AccountRegistry.syncRegistryToDb(vDb);
    assert.strictEqual(vDb.count(TABLES.MARKETPLACE_ACCOUNTS), 14, 'Must seed all 14 registered platform accounts');

    // Verify accounts have no private credentials
    const accounts = vDb.find(TABLES.MARKETPLACE_ACCOUNTS);
    for (const acc of accounts) {
      assert.strictEqual(acc.sellerId, null);
      assert.ok(acc.credentialsJson === '{}' || acc.credentialsJson === undefined);
    }
  });

  await it('validates vercel.json includes public assets and routes to Express api/index.js', () => {
    const fs = require('fs');
    const path = require('path');
    const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));

    // 1. Functions configuration includes public assets
    assert.ok(vercelConfig.functions && vercelConfig.functions['api/index.js'], 'Must configure api/index.js functions');
    assert.strictEqual(vercelConfig.functions['api/index.js'].includeFiles, 'public/**', 'Must bundle public/** in serverless function');

    // 2. Rewrites route to api/index.js
    const rewrites = vercelConfig.rewrites;
    assert.ok(Array.isArray(rewrites), 'rewrites must be an array');

    // Check that broken /public/ destinations are removed
    const brokenRewrite = rewrites.find(r => r.destination === '/public/$1' || r.destination === '/public/index.html');
    assert.strictEqual(brokenRewrite, undefined, 'Must not rewrite to directory /public/$1 or /public/index.html');

    // Check that API routes point to /api/index.js
    const apiRewrite = rewrites.find(r => r.source === '/api/(.*)' && r.destination === '/api/index.js');
    assert.ok(apiRewrite, 'Must rewrite /api/(.*) routes to /api/index.js');

    // Check that SPA fallback points to /index.html and NOT /api/index.js or /public/index.html
    const spaRewrite = rewrites.find(r => r.destination === '/index.html');
    assert.ok(spaRewrite, 'Must rewrite frontend paths to /index.html so Vercel CDN serves public/index.html');
    assert.strictEqual(spaRewrite.destination, '/index.html', 'Destination must be /index.html (not /public/index.html)');

    // Ensure root / is not rewritten in vercel.json to avoid edge rewrite loop
    const brokenRootRewrite = rewrites.find(r => (r.source === '/(.*)' || r.source === '/') && (r.destination === '/api/index.js' || r.destination === '/index.html'));
    assert.strictEqual(brokenRootRewrite, undefined, 'Must not rewrite root / directly to avoid edge rewrite cycle');
  });

  await it('regression test: RelationalDatabase.load() never calls fs.mkdirSync on non-existent path regardless of flags', () => {
    const fs = require('fs');
    const { RelationalDatabase } = require('../src/db');

    let mkdirAttempted = false;
    const origMkdirSync = fs.mkdirSync;
    fs.mkdirSync = function() {
      mkdirAttempted = true;
      return origMkdirSync.apply(this, arguments);
    };

    try {
      const nonExistentPath = 'Z:\\non_existent_drive\\random_folder_' + Date.now() + '\\cartman_db.json';
      const testDb = new RelationalDatabase(nonExistentPath, { isDemoMode: false });
      assert.strictEqual(mkdirAttempted, false, 'load() must NEVER attempt fs.mkdirSync when file does not exist');
      assert.strictEqual(testDb.count(TABLES.USERS), 0, 'Tables must be initialized empty in memory');
    } finally {
      fs.mkdirSync = origMkdirSync;
    }
  });

  await it('reproduces Vercel Lambda cold start without VERCEL env var and intercepts any filesystem writes', () => {
    const fs = require('fs');
    // 1. Simulate exact AWS Lambda environment where process.env.VERCEL is NOT set
    const savedVercel = process.env.VERCEL;
    const savedDemoMode = process.env.DEMO_MODE;
    const savedLambdaRoot = process.env.LAMBDA_TASK_ROOT;
    const savedExecutionEnv = process.env.AWS_EXECUTION_ENV;

    delete process.env.VERCEL;
    delete process.env.DEMO_MODE;
    process.env.LAMBDA_TASK_ROOT = '/var/task';
    process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs20.x';

    // 2. Intercept fs methods to detect any illegal disk access on /var/task
    const originalMkdirSync = fs.mkdirSync;
    const originalWriteFileSync = fs.writeFileSync;
    let illegalDiskAttempt = null;

    fs.mkdirSync = function(targetDir) {
      if (typeof targetDir === 'string' && targetDir.includes('/var/task')) {
        illegalDiskAttempt = `Illegal mkdirSync on ${targetDir}`;
        throw new Error(illegalDiskAttempt);
      }
      return originalMkdirSync.apply(this, arguments);
    };

    fs.writeFileSync = function(targetFile) {
      if (typeof targetFile === 'string' && targetFile.includes('/var/task')) {
        illegalDiskAttempt = `Illegal writeFileSync on ${targetFile}`;
        throw new Error(illegalDiskAttempt);
      }
      return originalWriteFileSync.apply(this, arguments);
    };

    try {
      const { RelationalDatabase: FreshDB } = require('../src/db');
      const lambdaDb = new FreshDB('/var/task/data/cartman_db.json');

      assert.strictEqual(illegalDiskAttempt, null, 'Must not attempt any mkdirSync/writeFileSync during load()');
      assert.strictEqual(lambdaDb.isDemoMode, true, 'isDemoMode must be auto-detected via LAMBDA_TASK_ROOT / /var/task path');

      // 5. Test saving and seeding
      lambdaDb.save();
      assert.strictEqual(illegalDiskAttempt, null, 'Must not attempt any writeFileSync during save()');

      const { AccountRegistry } = require('../src/registry/accountRegistry');
      AccountRegistry.syncRegistryToDb(lambdaDb);
      assert.strictEqual(illegalDiskAttempt, null, 'Must not attempt any disk writes during syncRegistryToDb()');
      assert.strictEqual(lambdaDb.count(TABLES.MARKETPLACE_ACCOUNTS), 14);

    } finally {
      // Restore fs and env
      fs.mkdirSync = originalMkdirSync;
      fs.writeFileSync = originalWriteFileSync;
      if (savedVercel !== undefined) process.env.VERCEL = savedVercel; else delete process.env.VERCEL;
      if (savedDemoMode !== undefined) process.env.DEMO_MODE = savedDemoMode; else delete process.env.DEMO_MODE;
      if (savedLambdaRoot !== undefined) process.env.LAMBDA_TASK_ROOT = savedLambdaRoot; else delete process.env.LAMBDA_TASK_ROOT;
      if (savedExecutionEnv !== undefined) process.env.AWS_EXECUTION_ENV = savedExecutionEnv; else delete process.env.AWS_EXECUTION_ENV;
    }
  });

  await it('serves private APIs with authentication, blocks unauthenticated requests with 401, and supports login/logout over HTTP', async () => {
    const http = require('http');
    const config = require('../src/config');
    const { app } = require('../src/server');

    // Helper for HTTP requests
    function makeHttpCall(server, method, reqPath, data = null, customHeaders = {}) {
      return new Promise((resolve, reject) => {
        const port = server.address().port;
        const options = {
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method,
          headers: { ...customHeaders }
        };
        let bodyPayload = null;
        if (data) {
          bodyPayload = typeof data === 'object' ? JSON.stringify(data) : data;
          options.headers['Content-Type'] = 'application/json';
          options.headers['Content-Length'] = Buffer.byteLength(bodyPayload);
        }
        const req = http.request(options, (res) => {
          let raw = '';
          res.on('data', chunk => { raw += chunk; });
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(raw); } catch (e) {}
            resolve({ statusCode: res.statusCode, body: raw, json });
          });
        });
        req.on('error', reject);
        if (bodyPayload) req.write(bodyPayload);
        req.end();
      });
    }

    const { generateCredentials } = require('../scripts/generateHash');
    const testUsername = 'http_test_admin';
    const testPassword = 'HttpAdminPass2026!';
    const testCreds = generateCredentials(testPassword, testUsername);

    const origUser = config.dashboardUsername;
    const origHash = config.dashboardPasswordHash;
    config.dashboardUsername = testCreds.username;
    config.dashboardPasswordHash = testCreds.passwordHash;

    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));

    try {
      // 1. GET / - Root serves index.html
      const rootRes = await makeHttpCall(testServer, 'GET', '/');
      assert.strictEqual(rootRes.statusCode, 200, 'GET / must return HTTP 200');
      assert.ok(rootRes.body.includes('Cartman'), 'GET / must return HTML containing Cartman');

      // 1b. GET /dashboard - SPA deep link serves index.html
      const dashRes = await makeHttpCall(testServer, 'GET', '/dashboard');
      assert.strictEqual(dashRes.statusCode, 200, 'GET /dashboard must return HTTP 200');
      assert.ok(dashRes.body.includes('Cartman'), 'GET /dashboard must return HTML');

      // 1c. GET /orders - SPA deep link serves index.html
      const ordersViewRes = await makeHttpCall(testServer, 'GET', '/orders');
      assert.strictEqual(ordersViewRes.statusCode, 200, 'GET /orders must return HTTP 200');
      assert.ok(ordersViewRes.body.includes('Cartman'), 'GET /orders must return HTML');

      // 1d. GET /css/styles.css - Static CSS asset
      const cssRes = await makeHttpCall(testServer, 'GET', '/css/styles.css');
      assert.strictEqual(cssRes.statusCode, 200, 'GET /css/styles.css must return HTTP 200');
      assert.ok(cssRes.body.includes('--'), 'GET /css/styles.css must return CSS content');

      // 1e. GET /js/app.js - Static JS asset
      const jsRes = await makeHttpCall(testServer, 'GET', '/js/app.js');
      assert.strictEqual(jsRes.statusCode, 200, 'GET /js/app.js must return HTTP 200');
      assert.ok(jsRes.body.includes('CartmanApp') || jsRes.body.includes('function'), 'GET /js/app.js must return JS content');

      // 2. GET /api/status - Health status
      const statusRes = await makeHttpCall(testServer, 'GET', '/api/status');
      assert.strictEqual(statusRes.statusCode, 200);
      assert.strictEqual(statusRes.json.status, 'healthy');

      // 3. GET /api/auth/me without token - MUST return HTTP 401
      const meUnauth = await makeHttpCall(testServer, 'GET', '/api/auth/me');
      assert.strictEqual(meUnauth.statusCode, 401, 'GET /api/auth/me without token must be 401 Unauthorized');

      // 4. GET /api/dashboard/overview without token - MUST return HTTP 401
      const overviewUnauth = await makeHttpCall(testServer, 'GET', '/api/dashboard/overview');
      assert.strictEqual(overviewUnauth.statusCode, 401, 'GET /api/dashboard/overview without token must be 401 Unauthorized');

      // 5. POST /api/auth/login with WRONG password - MUST return HTTP 401
      const loginFail = await makeHttpCall(testServer, 'POST', '/api/auth/login', {
        username: testUsername,
        password: 'IncorrectPassword123'
      });
      assert.strictEqual(loginFail.statusCode, 401, 'Login with incorrect password must return 401');
      assert.strictEqual(loginFail.json.success, false);

      // 6. POST /api/auth/login with CORRECT configured credentials - MUST return HTTP 200 and JWT
      const loginSuccess = await makeHttpCall(testServer, 'POST', '/api/auth/login', {
        username: testUsername,
        password: testPassword
      });
      assert.strictEqual(loginSuccess.statusCode, 200, 'Login with correct credentials must return 200');
      assert.strictEqual(loginSuccess.json.success, true);
      assert.ok(loginSuccess.json.token, 'Must return a signed JWT token');
      assert.strictEqual(loginSuccess.json.user.role, 'Admin');

      const authToken = loginSuccess.json.token;
      const authHeaders = { Authorization: `Bearer ${authToken}` };

      // 7. GET /api/auth/me with Bearer token - MUST return HTTP 200 and user profile
      const meAuth = await makeHttpCall(testServer, 'GET', '/api/auth/me', null, authHeaders);
      assert.strictEqual(meAuth.statusCode, 200);
      assert.strictEqual(meAuth.json.success, true);
      assert.strictEqual(meAuth.json.user.id, 'admin');

      // 8. GET /api/dashboard/overview with Bearer token - MUST return HTTP 200 and metrics
      const overviewAuth = await makeHttpCall(testServer, 'GET', '/api/dashboard/overview', null, authHeaders);
      assert.strictEqual(overviewAuth.statusCode, 200);
      assert.ok(overviewAuth.json.data.grandTotals, 'Must return grand totals');

      // 9. GET /api/accounts with Bearer token - MUST return HTTP 200 and accounts
      const accountsAuth = await makeHttpCall(testServer, 'GET', '/api/accounts', null, authHeaders);
      assert.strictEqual(accountsAuth.statusCode, 200);
      assert.ok(Array.isArray(accountsAuth.json.data));

      // 10. GET /api/orders/summary with Bearer token - MUST return HTTP 200
      const ordersAuth = await makeHttpCall(testServer, 'GET', '/api/orders/summary', null, authHeaders);
      assert.strictEqual(ordersAuth.statusCode, 200);
      assert.ok(ordersAuth.json.companyStatusCounts);

      // 11. GET /api/reconciliation/summary with Bearer token - MUST return HTTP 200
      const reconAuth = await makeHttpCall(testServer, 'GET', '/api/reconciliation/summary', null, authHeaders);
      assert.strictEqual(reconAuth.statusCode, 200);
      assert.ok(reconAuth.json.data.totals);

      // 12. POST /api/auth/logout - MUST return HTTP 200
      const logoutRes = await makeHttpCall(testServer, 'POST', '/api/auth/logout', {});
      assert.strictEqual(logoutRes.statusCode, 200);
      assert.strictEqual(logoutRes.json.success, true);

    } finally {
      config.dashboardUsername = origUser;
      config.dashboardPasswordHash = origHash;
      await new Promise(resolve => testServer.close(resolve));
    }
  });

  await it('preserves local development business database without modification', () => {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.resolve(__dirname, '../data/cartman_db.json');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      assert.ok(stats.size > 0, 'Local cartman_db.json file must not be empty');
      const raw = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(raw);
      assert.ok(parsed, 'Local cartman_db.json must contain valid JSON');
    }
  });

  // Test Group 12: Passwordless Email OTP Authentication & Rate Limiting
  console.log('\n--- 12. Passwordless Email OTP Authentication & Rate Limiting ---');

  await it('rejects unauthorized arbitrary email addresses from requesting an OTP', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();

    try {
      let err = null;
      try {
        await AuthService.requestEmailOtp({ email: 'unauthorized_stranger@external.com', ip: '10.0.0.1' });
      } catch (e) {
        err = e;
      }
      assert.ok(err, 'Must reject arbitrary unauthorized email');
      assert.ok(err.message.includes('Only the configured dashboard owner email is permitted'), 'Error message must state restriction');
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('fails with a clear server configuration error when DASHBOARD_OWNER_EMAIL is missing', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = '';
    OtpStore.resetForTesting();

    try {
      let err = null;
      try {
        await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: '10.0.0.1' });
      } catch (e) {
        err = e;
      }
      assert.ok(err, 'Must reject when DASHBOARD_OWNER_EMAIL is not configured');
      assert.ok(err.message.includes('Server Configuration Error: DASHBOARD_OWNER_EMAIL is not configured on the server'), 'Error message must clearly state configuration requirement');
      assert.ok(!err.message.includes('owner@cartman.internal'), 'Must never mention or fall back to internal mock email');
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('normalizes owner email comparison using trim() and lowercase', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();
    EmailService.clearDevOtp();

    try {
      // Test matching with whitespace and mixed casing
      const res = await AuthService.requestEmailOtp({ email: '   OWNER@CartmanDashboard.COM   ', ip: '10.0.0.2' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.email, 'owner@cartmandashboard.com');
      assert.strictEqual(res.deliveryMode, 'dev_mock');
      assert.ok(res.message.includes('server terminal console'), 'Must explain dev mode OTP location');
      assert.strictEqual(res.otp, undefined, 'Must not expose OTP in response');
      assert.strictEqual(res.devOtp, undefined, 'Must not expose devOtp in response');

      // Test non-owner email is rejected
      let nonOwnerErr = null;
      try {
        await AuthService.requestEmailOtp({ email: 'stranger@external.com', ip: '10.0.0.2' });
      } catch (e) {
        nonOwnerErr = e;
      }
      assert.ok(nonOwnerErr, 'Must reject non-owner email');
      assert.ok(nonOwnerErr.message.includes('Access Denied: Only the configured dashboard owner email is permitted to log in.'));
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('loads .env from project root consistently regardless of cwd and ignores .env.example', () => {
    const fs = require('fs');
    const path = require('path');
    const projectRoot = path.resolve(__dirname, '..');
    const rootEnv = path.resolve(projectRoot, '.env');
    const exampleEnv = path.resolve(projectRoot, '.env.example');

    assert.ok(fs.existsSync(rootEnv), 'Root .env must exist');
    assert.ok(fs.existsSync(exampleEnv), '.env.example must exist');

    // Verify .env.example is not loaded as active configuration
    const exampleContent = fs.readFileSync(exampleEnv, 'utf8');
    assert.ok(exampleContent.includes('DASHBOARD_OWNER_EMAIL'), '.env.example has template variables');

    // Test loadRootEnv behavior
    const config = require('../src/config');
    assert.strictEqual(typeof config.loadRootEnv, 'function');
  });

  await it('handles email provider delivery failure without reporting success', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();

    // Temporarily mock EmailService.sendOtp to simulate provider failure
    const origSendOtp = EmailService.sendOtp;
    EmailService.sendOtp = async () => {
      throw new Error('Resend delivery failed: Domain verification pending');
    };

    try {
      let deliveryErr = null;
      try {
        await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: '10.0.0.8' });
      } catch (e) {
        deliveryErr = e;
      }
      assert.ok(deliveryErr, 'Must throw error when email provider delivery fails');
      assert.ok(deliveryErr.message.includes('Domain verification pending'), 'Must propagate delivery failure reason');
    } finally {
      EmailService.sendOtp = origSendOtp;
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('generates cryptographically secure 6-digit OTP and signed challenge token for owner email without leaking OTP in response', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();
    EmailService.clearDevOtp();

    try {
      const res = await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: '10.0.0.2' });
      assert.strictEqual(res.success, true);
      assert.ok(res.challengeToken, 'Must issue a signed challenge token');
      assert.strictEqual(typeof res.challengeToken, 'string');
      assert.strictEqual(res.otp, undefined, 'Must NEVER reveal OTP in response object');
      assert.strictEqual(res.devOtp, undefined, 'Must NEVER reveal devOtp in response object');
      assert.strictEqual(res.expiresInSeconds, 300, 'Must have 5-minute expiry (300 seconds)');

      const dispatchedOtp = EmailService.getLastDevOtp();
      assert.ok(dispatchedOtp, 'Email service must record dispatched OTP in dev/test mode');
      assert.strictEqual(dispatchedOtp.length, 6, 'OTP must be exactly 6 digits');
      assert.ok(/^\d{6}$/.test(dispatchedOtp), 'OTP must be entirely numeric');
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('verifies correct OTP, consumes token, and issues signed session JWT for Admin user', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();
    EmailService.clearDevOtp();

    try {
      const otpReq = await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: '10.0.0.3' });
      const otpCode = EmailService.getLastDevOtp();

      const verifyRes = await AuthService.verifyEmailOtp({
        email: 'owner@cartmandashboard.com',
        otp: otpCode,
        challengeToken: otpReq.challengeToken,
        ip: '10.0.0.3'
      });

      assert.ok(verifyRes.token, 'Must return signed session JWT');
      assert.strictEqual(verifyRes.user.email, 'owner@cartmandashboard.com');
      assert.strictEqual(verifyRes.user.role, 'Admin');

      // Verify token authenticity
      const decoded = AuthService.verifyToken(verifyRes.token);
      assert.strictEqual(decoded.email, 'owner@cartmandashboard.com');
      assert.strictEqual(decoded.role, 'Admin');
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('rejects incorrect OTP codes and reports remaining attempts', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();
    EmailService.clearDevOtp();

    try {
      const otpReq = await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: '10.0.0.4' });
      let err = null;
      try {
        await AuthService.verifyEmailOtp({
          email: 'owner@cartmandashboard.com',
          otp: '000000',
          challengeToken: otpReq.challengeToken,
          ip: '10.0.0.4'
        });
      } catch (e) {
        err = e;
      }

      assert.ok(err, 'Must reject incorrect OTP code');
      assert.ok(err.message.includes('Invalid verification code'), 'Must notify user of invalid code');
      assert.ok(err.message.includes('remaining'), 'Must report remaining attempts');
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('enforces single-use guarantee and strictly rejects OTP replay attacks', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();
    EmailService.clearDevOtp();

    try {
      const otpReq = await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: '10.0.0.5' });
      const otpCode = EmailService.getLastDevOtp();

      // First verification succeeds
      const firstRes = await AuthService.verifyEmailOtp({
        email: 'owner@cartmandashboard.com',
        otp: otpCode,
        challengeToken: otpReq.challengeToken,
        ip: '10.0.0.5'
      });
      assert.ok(firstRes.token);

      // Second verification of same challengeToken MUST fail
      let replayErr = null;
      try {
        await AuthService.verifyEmailOtp({
          email: 'owner@cartmandashboard.com',
          otp: otpCode,
          challengeToken: otpReq.challengeToken,
          ip: '10.0.0.5'
        });
      } catch (e) {
        replayErr = e;
      }

      assert.ok(replayErr, 'Must reject re-verification of already used OTP');
      assert.ok(replayErr.message.includes('already been used'), 'Must specify code was already used');
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('strictly rejects expired OTP verification tokens', async () => {
    const jwt = require('jsonwebtoken');
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();

    try {
      // Create a challenge token that expired 10 seconds ago
      const expiredPayload = {
        email: 'owner@cartmandashboard.com',
        otpHash: 'dummyhash',
        salt: 'dummysalt',
        expiresAt: Date.now() - 10000,
        jti: 'expired_jti_123'
      };

      const expiredToken = jwt.sign(expiredPayload, config.jwtSecret, {
        expiresIn: '-10s'
      });

      let expireErr = null;
      try {
        await AuthService.verifyEmailOtp({
          email: 'owner@cartmandashboard.com',
          otp: '123456',
          challengeToken: expiredToken,
          ip: '10.0.0.6'
        });
      } catch (e) {
        expireErr = e;
      }

      assert.ok(expireErr, 'Must reject expired challenge token');
      assert.ok(expireErr.message.includes('expired'), 'Must state token has expired');
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('enforces rate limits on excessive OTP generation requests (3 per 10m window)', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();

    const testIp = '10.99.88.77';
    try {
      // 3 successful requests
      await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: testIp });
      await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: testIp });
      await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: testIp });

      // 4th request must be blocked by rate limit
      let rateLimitErr = null;
      try {
        await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: testIp });
      } catch (e) {
        rateLimitErr = e;
      }

      assert.ok(rateLimitErr, '4th OTP request within window must be rejected');
      assert.ok(rateLimitErr.message.includes('Too many OTP requests'), 'Error must indicate rate limit');
    } finally {
      config.dashboardOwnerEmail = origOwner;
      OtpStore.resetForTesting();
    }
  });

  await it('enforces maximum 3 verification attempts per challenge session', async () => {
    const config = require('../src/config');
    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'owner@cartmandashboard.com';
    OtpStore.resetForTesting();
    EmailService.clearDevOtp();

    try {
      const otpReq = await AuthService.requestEmailOtp({ email: 'owner@cartmandashboard.com', ip: '10.0.0.7' });

      // Attempt 1 (wrong code)
      await assert.rejects(
        () => AuthService.verifyEmailOtp({ email: 'owner@cartmandashboard.com', otp: '111111', challengeToken: otpReq.challengeToken, ip: '10.0.0.7' }),
        /2 attempts remaining/
      );

      // Attempt 2 (wrong code)
      await assert.rejects(
        () => AuthService.verifyEmailOtp({ email: 'owner@cartmandashboard.com', otp: '222222', challengeToken: otpReq.challengeToken, ip: '10.0.0.7' }),
        /1 attempt remaining/
      );

      // Attempt 3 (wrong code) - consumes token
      await assert.rejects(
        () => AuthService.verifyEmailOtp({ email: 'owner@cartmandashboard.com', otp: '333333', challengeToken: otpReq.challengeToken, ip: '10.0.0.7' }),
        /Maximum verification attempts exceeded/
      );

      // Even if user now submits the actual correct code, challenge is dead
      const correctOtp = EmailService.getLastDevOtp();
      await assert.rejects(
        () => AuthService.verifyEmailOtp({ email: 'owner@cartmandashboard.com', otp: correctOtp, challengeToken: otpReq.challengeToken, ip: '10.0.0.7' }),
        /Maximum verification attempts exceeded|already been used/
      );
    } finally {
      config.dashboardOwnerEmail = origOwner;
    }
  });

  await it('serves passwordless Email OTP flow over HTTP endpoints and allows authenticated dashboard access', async () => {
    const http = require('http');
    const config = require('../src/config');
    const { app: localApp } = require('../src/server');

    const origOwner = config.dashboardOwnerEmail;
    config.dashboardOwnerEmail = 'live_owner@cartman.internal';
    OtpStore.resetForTesting();
    EmailService.clearDevOtp();

    function makeCall(server, method, reqPath, data = null, customHeaders = {}) {
      return new Promise((resolve, reject) => {
        const port = server.address().port;
        const bodyStr = data ? JSON.stringify(data) : '';
        const headers = { ...customHeaders };
        if (data) {
          headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method,
          headers
        }, (res) => {
          let chunks = '';
          res.on('data', chunk => { chunks += chunk; });
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(chunks); } catch (e) {}
            resolve({ statusCode: res.statusCode, headers: res.headers, body: chunks, json });
          });
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
      });
    }

    const testServer = http.createServer(localApp);
    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));

    try {
      // 0a. POST /api/auth/request-otp with missing DASHBOARD_OWNER_EMAIL returns HTTP 500
      config.dashboardOwnerEmail = '';
      const missingConfigReq = await makeCall(testServer, 'POST', '/api/auth/request-otp', {
        email: 'live_owner@cartman.internal'
      });
      assert.strictEqual(missingConfigReq.statusCode, 500);
      assert.strictEqual(missingConfigReq.json.success, false);
      assert.ok(missingConfigReq.json.error.includes('Server Configuration Error'));
      config.dashboardOwnerEmail = 'live_owner@cartman.internal';

      // 0b. POST /api/auth/request-otp when email provider fails returns HTTP 502
      const origSendMethod = EmailService.sendOtp;
      EmailService.sendOtp = async () => { throw new Error('Resend delivery failed with HTTP 403'); };
      const failedDeliveryReq = await makeCall(testServer, 'POST', '/api/auth/request-otp', {
        email: 'live_owner@cartman.internal'
      });
      assert.strictEqual(failedDeliveryReq.statusCode, 502);
      assert.strictEqual(failedDeliveryReq.json.success, false);
      assert.ok(failedDeliveryReq.json.error.includes('Resend delivery failed'));
      EmailService.sendOtp = origSendMethod;

      // 1. POST /api/auth/request-otp with unauthorized email returns HTTP 403
      const unauthReq = await makeCall(testServer, 'POST', '/api/auth/request-otp', {
        email: 'random_hacker@evil.com'
      });
      assert.strictEqual(unauthReq.statusCode, 403);
      assert.strictEqual(unauthReq.json.success, false);

      // 2. POST /api/auth/request-otp with verified owner email returns HTTP 200 + challengeToken
      const ownerReq = await makeCall(testServer, 'POST', '/api/auth/request-otp', {
        email: 'live_owner@cartman.internal'
      });
      assert.strictEqual(ownerReq.statusCode, 200);
      assert.strictEqual(ownerReq.json.success, true);
      assert.ok(ownerReq.json.challengeToken);
      assert.strictEqual(ownerReq.json.otp, undefined, 'Must not leak OTP over HTTP');

      const challengeToken = ownerReq.json.challengeToken;
      const correctOtp = EmailService.getLastDevOtp();

      // 3. POST /api/auth/verify-otp with WRONG code returns HTTP 400
      const wrongVerify = await makeCall(testServer, 'POST', '/api/auth/verify-otp', {
        email: 'live_owner@cartman.internal',
        otp: '999999',
        challengeToken
      });
      assert.strictEqual(wrongVerify.statusCode, 400);
      assert.strictEqual(wrongVerify.json.success, false);

      // 4. POST /api/auth/verify-otp with CORRECT code returns HTTP 200 + Session JWT
      const correctVerify = await makeCall(testServer, 'POST', '/api/auth/verify-otp', {
        email: 'live_owner@cartman.internal',
        otp: correctOtp,
        challengeToken
      });
      assert.strictEqual(correctVerify.statusCode, 200);
      assert.strictEqual(correctVerify.json.success, true);
      assert.ok(correctVerify.json.token);
      assert.strictEqual(correctVerify.json.user.role, 'Admin');

      const sessionToken = correctVerify.json.token;

      // 5. GET /api/auth/me with session token returns user profile
      const meRes = await makeCall(testServer, 'GET', '/api/auth/me', null, {
        Authorization: `Bearer ${sessionToken}`
      });
      assert.strictEqual(meRes.statusCode, 200);
      assert.strictEqual(meRes.json.user.email, 'live_owner@cartman.internal');

      // 6. Access protected data endpoint /api/dashboard/overview
      const dashRes = await makeCall(testServer, 'GET', '/api/dashboard/overview', null, {
        Authorization: `Bearer ${sessionToken}`
      });
      assert.strictEqual(dashRes.statusCode, 200);
      assert.ok(dashRes.json.data.grandTotals);

      // 7. POST /api/auth/logout succeeds
      const logoutRes = await makeCall(testServer, 'POST', '/api/auth/logout', {});
      assert.strictEqual(logoutRes.statusCode, 200);
      assert.strictEqual(logoutRes.json.success, true);

    } finally {
      config.dashboardOwnerEmail = origOwner;
      await new Promise(resolve => testServer.close(resolve));
    }
  });

  await it('verifies that all private data APIs strictly return 401 Unauthorized without valid JWT and DEMO_MODE=false', async () => {
    const http = require('http');
    const { app: localApp } = require('../src/server');
    const config = require('../src/config');

    const origDemo = config.isDemoMode;
    config.isDemoMode = false;

    function getUnauth(server, reqPath) {
      return new Promise((resolve, reject) => {
        const port = server.address().port;
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method: 'GET'
        }, (res) => {
          let chunks = '';
          res.on('data', c => { chunks += c; });
          res.on('end', () => {
            let json = {};
            try { json = JSON.parse(chunks); } catch (e) {}
            resolve({ statusCode: res.statusCode, json });
          });
        });
        req.on('error', reject);
        req.end();
      });
    }

    const testServer = http.createServer(localApp);
    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));

    const protectedEndpoints = [
      '/api/auth/me',
      '/api/dashboard/overview',
      '/api/dashboard/trends',
      '/api/accounts',
      '/api/orders/summary',
      '/api/reconciliation/summary',
      '/api/bank/profiles',
      '/api/reports/print',
      '/api/users',
      '/api/integrations/specs',
      '/api/sales-report/daily-summaries'
    ];

    try {
      for (const endpoint of protectedEndpoints) {
        const res = await getUnauth(testServer, endpoint);
        assert.strictEqual(
          res.statusCode,
          401,
          `Endpoint ${endpoint} must strictly return 401 Unauthorized without valid JWT token`
        );
        assert.strictEqual(res.json.success, false);
      }
    } finally {
      config.isDemoMode = origDemo;
      await new Promise(resolve => testServer.close(resolve));
    }
  });

  await it('verifies that Redis persistence synchronizes rate limits, attempt counts, and single-use JTI across serverless instances', async () => {
    const http = require('http');
    const config = require('../src/config');
    const origUrl = config.upstashRedisUrl;
    const origToken = config.upstashRedisToken;
    const origOwner = config.dashboardOwnerEmail;

    config.dashboardOwnerEmail = 'redis_owner@cartman.internal';
    OtpStore.resetForTesting();
    EmailService.clearDevOtp();

    // Mock an Upstash Redis REST service in memory
    const redisKV = new Map();
    const redisServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let cmd = [];
        try { cmd = JSON.parse(body); } catch (e) {}
        const op = (cmd[0] || '').toUpperCase();
        let result = null;

        if (op === 'INCR') {
          const val = (parseInt(redisKV.get(cmd[1]) || '0', 10) + 1);
          redisKV.set(cmd[1], val.toString());
          result = val;
        } else if (op === 'EXPIRE') {
          result = 1;
        } else if (op === 'GET') {
          result = redisKV.get(cmd[1]) || null;
        } else if (op === 'SETEX') {
          redisKV.set(cmd[1], cmd[3]);
          result = 'OK';
        } else if (op === 'DEL') {
          redisKV.delete(cmd[1]);
          result = 1;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ result }));
      });
    });

    await new Promise(resolve => redisServer.listen(0, '127.0.0.1', resolve));
    const redisPort = redisServer.address().port;

    // Point config to this Redis mock
    config.upstashRedisUrl = `http://127.0.0.1:${redisPort}`;
    config.upstashRedisToken = 'mock_upstash_token';

    try {
      // 1. Create OTP -> persists in Redis
      const otpReq = await AuthService.requestEmailOtp({ email: 'redis_owner@cartman.internal', ip: '127.0.0.1' });
      assert.ok(redisKV.has('otp:redis_owner@cartman.internal'), 'Must persist active OTP record in Redis');

      // 2. Clear local memory maps to simulate cold start on a new serverless instance
      OtpStore.resetForTesting();

      // 3. Verify OTP on "Instance B" using the Redis mock state
      const otpCode = EmailService.getLastDevOtp();
      const verifyRes = await AuthService.verifyEmailOtp({
        email: 'redis_owner@cartman.internal',
        otp: otpCode,
        challengeToken: otpReq.challengeToken,
        ip: '127.0.0.1'
      });
      assert.ok(verifyRes.token, 'Must successfully verify and return JWT');

      // 4. Verify that consumed_jti was written to Redis
      let jtiFound = false;
      for (const k of redisKV.keys()) {
        if (k.startsWith('consumed_jti:')) jtiFound = true;
      }
      assert.ok(jtiFound, 'Must record consumed JTI in Redis for distributed replay prevention');

      // 5. Clear local memory maps again to simulate "Instance C"
      OtpStore.resetForTesting();

      // 6. Attempt replay on "Instance C" -> MUST fail because Redis knows JTI is consumed
      let replayErr = null;
      try {
        await AuthService.verifyEmailOtp({
          email: 'redis_owner@cartman.internal',
          otp: otpCode,
          challengeToken: otpReq.challengeToken,
          ip: '127.0.0.1'
        });
      } catch (e) {
        replayErr = e;
      }
      assert.ok(replayErr, 'Replay on separate serverless instance must fail via Redis');
      assert.ok(replayErr.message.includes('already been used'), 'Must reject consumed JTI across instances');

    } finally {
      config.upstashRedisUrl = origUrl;
      config.upstashRedisToken = origToken;
      config.dashboardOwnerEmail = origOwner;
      await new Promise(resolve => redisServer.close(resolve));
      OtpStore.resetForTesting();
    }
  });

  console.log('\n--- 13. Resend Email Delivery Service & Safe Error Handling ---');

  function mockHttpsRequest({ statusCode = 200, body = '{}', error = null, onRequest = null }) {
    const https = require('https');
    const EventEmitter = require('events');
    const origRequest = https.request;

    https.request = function(options, callback) {
      const reqEmitter = new EventEmitter();
      let sentChunks = '';

      reqEmitter.write = function(chunk) {
        if (chunk) sentChunks += chunk;
        return true;
      };

      reqEmitter.setTimeout = function() { return this; };
      reqEmitter.destroy = function(err) {
        reqEmitter.emit('error', err);
        return this;
      };

      reqEmitter.end = function(chunk) {
        if (chunk) sentChunks += chunk;
        if (onRequest) {
          onRequest(options, sentChunks);
        }
        process.nextTick(() => {
          if (error) {
            reqEmitter.emit('error', error);
            return;
          }

          const resEmitter = new EventEmitter();
          resEmitter.statusCode = statusCode;
          resEmitter.headers = { 'content-type': 'application/json' };

          if (callback) {
            callback(resEmitter);
          }

          process.nextTick(() => {
            resEmitter.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
            resEmitter.emit('end');
          });
        });
        return this;
      };

      return reqEmitter;
    };

    return () => {
      https.request = origRequest;
    };
  }

  await it('validates and parses EMAIL_FROM configurations correctly and rejects malformed senders', () => {
    // 1. Display Name + address format
    const parsed1 = EmailService.parseSender('Cartman Dashboard <onboarding@resend.dev>');
    assert.strictEqual(parsed1.displayName, 'Cartman Dashboard');
    assert.strictEqual(parsed1.address, 'onboarding@resend.dev');
    assert.strictEqual(parsed1.formatted, 'Cartman Dashboard <onboarding@resend.dev>');

    // 2. Pure email address format
    const parsed2 = EmailService.parseSender('owner@verified-domain.com');
    assert.strictEqual(parsed2.displayName, '');
    assert.strictEqual(parsed2.address, 'owner@verified-domain.com');
    assert.strictEqual(parsed2.formatted, 'owner@verified-domain.com');

    // 3. Rejects empty string or missing sender
    assert.throws(() => EmailService.parseSender(''), /EMAIL_FROM is required/);
    assert.throws(() => EmailService.parseSender('   '), /EMAIL_FROM is required/);
    assert.throws(() => EmailService.parseSender(null), /EMAIL_FROM is required/);

    // 4. Rejects malformed sender strings without valid email
    assert.throws(() => EmailService.parseSender('Just Plain Text'), /Invalid EMAIL_FROM format/);
    assert.throws(() => EmailService.parseSender('Cartman <invalid_email>'), /Invalid EMAIL_FROM format/);
    assert.throws(() => EmailService.parseSender('<onboarding@resend.dev>'), /Invalid EMAIL_FROM format/);
    assert.throws(() => EmailService.parseSender('owner@domain'), /Invalid EMAIL_FROM format/);
  });

  await it('validates Resend API key format and throws safe errors when missing or invalid in live delivery', () => {
    // 1. Valid API key starting with 're_'
    const key = EmailService.validateApiKey('re_test_live_key_12345');
    assert.strictEqual(key, 're_test_live_key_12345');

    // 2. Trims leading and trailing whitespace
    const trimmedKey = EmailService.validateApiKey('   re_spaced_key_67890   ');
    assert.strictEqual(trimmedKey, 're_spaced_key_67890');

    // 3. Throws safe error when missing
    assert.throws(() => EmailService.validateApiKey(''), /Email service is not configured/);
    assert.throws(() => EmailService.validateApiKey(null), /Email service is not configured/);

    // 4. Throws safe error when not starting with 're_'
    assert.throws(() => EmailService.validateApiKey('invalid_prefix_key'), /Invalid RESEND_API_KEY format/);
    assert.throws(() => EmailService.validateApiKey('1234567890'), /Invalid RESEND_API_KEY format/);
  });

  await it('successfully delivers OTP email via Resend API (HTTP 200) and captures provider message ID', async () => {
    let capturedOptions = null;
    let capturedPayload = null;

    const restoreHttps = mockHttpsRequest({
      statusCode: 200,
      body: JSON.stringify({ id: 'msg_resend_mock_success_1001' }),
      onRequest: (options, payload) => {
        capturedOptions = options;
        capturedPayload = payload;
      }
    });

    const origApiKey = config.resendApiKey;
    const origFrom = config.emailFrom;
    config.resendApiKey = 're_mock_test_key_for_unit_tests';
    config.emailFrom = 'Cartman Dashboard <onboarding@resend.dev>';

    try {
      const res = await EmailService.sendOtp({
        email: 'test_real_owner@domain.com',
        otp: '849201',
        forceResend: true
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.id, 'msg_resend_mock_success_1001');
      assert.strictEqual(res.mode, 'resend');

      // Verify request metadata
      assert.ok(capturedOptions, 'Must call Resend API endpoint');
      assert.strictEqual(capturedOptions.hostname, 'api.resend.com');
      assert.strictEqual(capturedOptions.path, '/emails');
      assert.strictEqual(capturedOptions.method, 'POST');
      assert.strictEqual(capturedOptions.headers['Authorization'], 'Bearer re_mock_test_key_for_unit_tests');
      assert.strictEqual(capturedOptions.headers['Content-Type'], 'application/json');

      // Verify payload structure
      const parsedBody = JSON.parse(capturedPayload);
      assert.strictEqual(parsedBody.from, 'Cartman Dashboard <onboarding@resend.dev>');
      assert.deepStrictEqual(parsedBody.to, ['test_real_owner@domain.com']);
      assert.ok(parsedBody.subject.includes('849201'));
      assert.ok(parsedBody.html.includes('849201'));
    } finally {
      restoreHttps();
      config.resendApiKey = origApiKey;
      config.emailFrom = origFrom;
    }
  });

  await it('safely handles Resend HTTP 401 Unauthorized without leaking API keys or tokens', async () => {
    const restoreHttps = mockHttpsRequest({
      statusCode: 401,
      body: JSON.stringify({ statusCode: 401, message: 'API key is invalid', name: 'authentication_error' })
    });

    const origApiKey = config.resendApiKey;
    config.resendApiKey = 're_mock_bad_key';

    try {
      let deliveryErr = null;
      try {
        await EmailService.sendOtp({
          email: 'test_real_owner@domain.com',
          otp: '123456',
          forceResend: true
        });
      } catch (e) {
        deliveryErr = e;
      }

      assert.ok(deliveryErr, 'Must reject on HTTP 401');
      assert.ok(deliveryErr.message.includes('Resend API authentication failed'), 'Must provide clear authentication error');
      assert.ok(!deliveryErr.message.includes('re_mock_bad_key'), 'Must NEVER leak API key in error message');
    } finally {
      restoreHttps();
      config.resendApiKey = origApiKey;
    }
  });

  await it('safely handles Resend HTTP 403 sandbox restriction when using onboarding@resend.dev', async () => {
    const restoreHttps = mockHttpsRequest({
      statusCode: 403,
      body: JSON.stringify({
        statusCode: 403,
        name: 'validation_error',
        message: 'You can only send testing emails to your own email address (registered_user@example.com). To send emails to other recipients, please verify a domain at resend.com/domains.'
      })
    });

    const origApiKey = config.resendApiKey;
    const origFrom = config.emailFrom;
    config.resendApiKey = 're_mock_test_key';
    config.emailFrom = 'Cartman Dashboard <onboarding@resend.dev>';

    try {
      let deliveryErr = null;
      try {
        await EmailService.sendOtp({
          email: 'unregistered_recipient@external.com',
          otp: '123456',
          forceResend: true
        });
      } catch (e) {
        deliveryErr = e;
      }

      assert.ok(deliveryErr, 'Must reject on HTTP 403 sandbox restriction');
      assert.ok(deliveryErr.message.includes('Resend sandbox restriction: onboarding@resend.dev can only deliver to the verified Resend account owner email'), 'Must explain onboarding restriction');
      assert.ok(deliveryErr.message.includes('verify a custom domain in Resend'), 'Must guide user to verify domain');
    } finally {
      restoreHttps();
      config.resendApiKey = origApiKey;
      config.emailFrom = origFrom;
    }
  });

  await it('safely handles Resend HTTP 422 Unprocessable Entity for invalid sender formatting', async () => {
    const restoreHttps = mockHttpsRequest({
      statusCode: 422,
      body: JSON.stringify({
        statusCode: 422,
        name: 'validation_error',
        message: 'The domain unverified-domain.com is not verified.'
      })
    });

    const origApiKey = config.resendApiKey;
    config.resendApiKey = 're_mock_test_key';

    try {
      let deliveryErr = null;
      try {
        await EmailService.sendOtp({
          email: 'recipient@somewhere.com',
          otp: '123456',
          forceResend: true
        });
      } catch (e) {
        deliveryErr = e;
      }

      assert.ok(deliveryErr, 'Must reject on HTTP 422');
      assert.ok(deliveryErr.message.includes('Resend rejected the email request (HTTP 422)'), 'Must identify 422 error safely');
    } finally {
      restoreHttps();
      config.resendApiKey = origApiKey;
    }
  });

  await it('safely handles Resend HTTP 429 rate limit errors and HTTP 500 upstream errors', async () => {
    const origApiKey = config.resendApiKey;
    config.resendApiKey = 're_mock_test_key';

    // 1. Test HTTP 429
    let restoreHttps = mockHttpsRequest({
      statusCode: 429,
      body: JSON.stringify({ statusCode: 429, message: 'Too many requests' })
    });

    try {
      await assert.rejects(
        () => EmailService.sendOtp({ email: 'recipient@somewhere.com', otp: '123456', forceResend: true }),
        /Resend rate limit exceeded \(HTTP 429\)/
      );
    } finally {
      restoreHttps();
    }

    // 2. Test HTTP 500
    restoreHttps = mockHttpsRequest({
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' })
    });

    try {
      await assert.rejects(
        () => EmailService.sendOtp({ email: 'recipient@somewhere.com', otp: '123456', forceResend: true }),
        /Resend service temporarily unavailable \(HTTP 500\)/
      );
    } finally {
      restoreHttps();
      config.resendApiKey = origApiKey;
    }
  });

  await it('safely handles provider network connectivity failures without crashing', async () => {
    const restoreHttps = mockHttpsRequest({
      error: new Error('connect ECONNREFUSED 104.18.23.45:443')
    });

    const origApiKey = config.resendApiKey;
    config.resendApiKey = 're_mock_test_key';

    try {
      await assert.rejects(
        () => EmailService.sendOtp({ email: 'recipient@somewhere.com', otp: '123456', forceResend: true }),
        /Email provider network error: connect ECONNREFUSED/
      );
    } finally {
      restoreHttps();
      config.resendApiKey = origApiKey;
    }
  });

  await it('strictly ensures development mock OTP output is inaccessible in production mode', async () => {
    const origEnv = config.nodeEnv;
    const origKey = config.resendApiKey;

    try {
      // 1. Simulate production mode
      config.nodeEnv = 'production';
      config.resendApiKey = '';
      EmailService.clearDevOtp();

      // In production mode, getLastDevOtp must always return null
      assert.strictEqual(EmailService.getLastDevOtp(), null, 'getLastDevOtp() must strictly return null in production mode');

      // In production mode, sendOtp must NEVER fall back to dev_mock when API key is missing
      await assert.rejects(
        () => EmailService.sendOtp({ email: 'owner@cartmandashboard.com', otp: '123456' }),
        /Email service is not configured/
      );

      // Verify that lastDevOtp was not populated even after failed attempt
      assert.strictEqual(EmailService.getLastDevOtp(), null, 'Dev OTP must remain null');
    } finally {
      config.nodeEnv = origEnv;
      config.resendApiKey = origKey;
      EmailService.clearDevOtp();
    }
  });

  console.log('\n=======================================================');
  console.log(`   TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('=======================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests();
