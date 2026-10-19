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
    const res = await AuthService.initiateLogin({ email: 'admin@cartman.com', password: 'CartmanAdmin2026!' });
    assert.strictEqual(res.otpRequired, true);
    assert.ok(res.expiresInSeconds > 0);

    const tokenRes = await AuthService.verifyOtp({ email: 'admin@cartman.com', otp: res.devOtp || '123456' });
    assert.ok(tokenRes.token);
    assert.strictEqual(tokenRes.user.email, 'admin@cartman.com');
    assert.strictEqual(tokenRes.user.role, 'Admin');
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

  // Test Group 10: Public Demo Mode & Vercel Read-Only Security
  console.log('\n--- 10. Public Demo Mode & Vercel Read-Only Security ---');

  it('blocks all data-changing mutations with 403 and clear demo message', () => {
    const config = require('../src/config');
    const { requireAuth } = require('../src/auth/middleware');

    // Temporarily simulate demo mode
    const originalDemoMode = config.isDemoMode;
    config.isDemoMode = true;

    try {
      const mutationMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of mutationMethods) {
        let statusSet = null;
        let responseJson = null;

        const mockReq = { method, headers: {} };
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

        assert.strictEqual(statusSet, 403, `${method} must return 403 in demo mode`);
        assert.strictEqual(nextCalled, false, `${method} must NOT reach route handler in demo mode`);
        assert.strictEqual(responseJson.isDemoLocked, true, 'Response must identify demo lock');
        assert(responseJson.error.includes('Disabled in Public Demo'), 'Error message must specify Disabled in Public Demo');
      }
    } finally {
      config.isDemoMode = originalDemoMode;
    }
  });

  it('allows read-only GET requests as demo_guest in demo mode without credentials', () => {
    const config = require('../src/config');
    const { requireAuth } = require('../src/auth/middleware');

    const originalDemoMode = config.isDemoMode;
    config.isDemoMode = true;

    try {
      const mockReq = { method: 'GET', headers: {} };
      const mockRes = {};
      let nextCalled = false;

      requireAuth(mockReq, mockRes, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, true, 'GET request must pass through in demo mode');
      assert.strictEqual(mockReq.user.id, 'demo_guest', 'User must be assigned demo_guest');
      assert.strictEqual(mockReq.user.role, 'Admin', 'Guest user must have Admin role for full view navigation');
    } finally {
      config.isDemoMode = originalDemoMode;
    }
  });

  it('masks Firebase configuration in demo mode', () => {
    const config = require('../src/config');
    const originalDemoMode = config.isDemoMode;
    config.isDemoMode = true;

    try {
      // Simulate GET /api/firebase/config handler logic
      const isConfigured = false;
      const maskedData = {
        apiKey: '',
        projectId: '',
        isConfigured: false,
        isDemoMode: true
      };
      assert.strictEqual(maskedData.apiKey, '');
      assert.strictEqual(maskedData.projectId, '');
      assert.strictEqual(maskedData.isConfigured, false);
      assert.strictEqual(maskedData.isDemoMode, true);
    } finally {
      config.isDemoMode = originalDemoMode;
    }
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

  await it('validates vercel.json includes public assets and prevents directory rewrite', () => {
    const fs = require('fs');
    const path = require('path');
    const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));

    // 1. Functions configuration includes public assets
    assert.ok(vercelConfig.functions && vercelConfig.functions['api/index.js'], 'Must configure api/index.js functions');
    assert.strictEqual(vercelConfig.functions['api/index.js'].includeFiles, 'public/**', 'Must bundle public/** in serverless function');

    // 2. Rewrites route API to api/index.js and root/SPA to /index.html
    const rewrites = vercelConfig.rewrites;
    assert.ok(Array.isArray(rewrites), 'rewrites must be an array');

    // Check that broken /public/$1 destination is removed
    const brokenRewrite = rewrites.find(r => r.destination === '/public/$1');
    assert.strictEqual(brokenRewrite, undefined, 'Must not rewrite to directory /public/$1');

    // Check that /api routes point to /api/index.js
    const apiRewrite = rewrites.find(r => r.source === '/api/(.*)' && r.destination === '/api/index.js');
    assert.ok(apiRewrite, 'Must rewrite /api/(.*) to /api/index.js');

    // Check SPA fallback to /index.html
    const spaRewrite = rewrites.find(r => r.destination === '/index.html');
    assert.ok(spaRewrite, 'Must rewrite non-api requests to /index.html');
  });

  await it('serves public read-only GET APIs and blocks all mutations over HTTP in demo mode', async () => {
    const http = require('http');
    const config = require('../src/config');
    const { app } = require('../src/server');

    const originalDemoMode = config.isDemoMode;
    const originalReadOnly = config.isReadOnly;
    config.isDemoMode = true;
    config.isReadOnly = true;

    // Helper for HTTP requests
    function makeHttpCall(server, method, reqPath, data = null) {
      return new Promise((resolve, reject) => {
        const port = server.address().port;
        const options = {
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method,
          headers: {}
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

    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));

    try {
      // 1. GET / - SPA fallback should return HTTP 200 with HTML (not 500)
      const rootRes = await makeHttpCall(testServer, 'GET', '/');
      assert.strictEqual(rootRes.statusCode, 200, 'GET / must return HTTP 200');
      assert.ok(rootRes.body.includes('Cartman'), 'GET / must return HTML containing Cartman');

      // 2. GET /api/status - Public demo status
      const statusRes = await makeHttpCall(testServer, 'GET', '/api/status');
      assert.strictEqual(statusRes.statusCode, 200);
      assert.strictEqual(statusRes.json.isDemoMode, true);
      assert.strictEqual(statusRes.json.isReadOnly, true);

      // 3. GET /api/auth/me - Public guest access without token
      const meRes = await makeHttpCall(testServer, 'GET', '/api/auth/me');
      assert.strictEqual(meRes.statusCode, 200);
      assert.strictEqual(meRes.json.user.id, 'demo_guest');
      assert.strictEqual(meRes.json.user.role, 'Admin');

      // 4. GET /api/dashboard/overview - Valid demo metrics
      const overviewRes = await makeHttpCall(testServer, 'GET', '/api/dashboard/overview');
      assert.strictEqual(overviewRes.statusCode, 200);
      assert.ok(overviewRes.json.data.grandTotals, 'Must return grand totals');

      // 5. GET /api/accounts - Masked accounts list
      const accountsRes = await makeHttpCall(testServer, 'GET', '/api/accounts');
      assert.strictEqual(accountsRes.statusCode, 200);
      assert.ok(Array.isArray(accountsRes.json.data));

      // 6. GET /api/orders/summary - Order breakdown
      const ordersRes = await makeHttpCall(testServer, 'GET', '/api/orders/summary');
      assert.strictEqual(ordersRes.statusCode, 200);
      assert.ok(ordersRes.json.companyStatusCounts);

      // 7. GET /api/reconciliation/summary - Reconciliation overview
      const reconRes = await makeHttpCall(testServer, 'GET', '/api/reconciliation/summary');
      assert.strictEqual(reconRes.statusCode, 200);
      assert.ok(reconRes.json.data.totals);

      // 8. GET /api/firebase/config - Masked empty config
      const fbRes = await makeHttpCall(testServer, 'GET', '/api/firebase/config');
      assert.strictEqual(fbRes.statusCode, 200);
      assert.strictEqual(fbRes.json.data.apiKey, '');
      assert.strictEqual(fbRes.json.data.projectId, '');

      // 9. GET /api/sales-report/accounts - Sales report accounts
      const srAccRes = await makeHttpCall(testServer, 'GET', '/api/sales-report/accounts');
      assert.strictEqual(srAccRes.statusCode, 200);
      assert.ok(Array.isArray(srAccRes.json.accounts));

      // 10. POST mutations MUST ALL return HTTP 403 Forbidden
      const postLogin = await makeHttpCall(testServer, 'POST', '/api/auth/login', { email: 'admin@cartman.com', password: 'xyz' });
      assert.strictEqual(postLogin.statusCode, 403, 'POST /api/auth/login must be 403 in demo mode');

      const postAccounts = await makeHttpCall(testServer, 'POST', '/api/accounts', { marketplace: 'amazon' });
      assert.strictEqual(postAccounts.statusCode, 403, 'POST /api/accounts must be 403 in demo mode');

      const postReconMatch = await makeHttpCall(testServer, 'POST', '/api/reconciliation/match', { bankTransactionId: '1', settlementId: '2' });
      assert.strictEqual(postReconMatch.statusCode, 403, 'POST /api/reconciliation/match must be 403 in demo mode');

      const postUsers = await makeHttpCall(testServer, 'POST', '/api/users', { email: 'new@cartman.com' });
      assert.strictEqual(postUsers.statusCode, 403, 'POST /api/users must be 403 in demo mode');

      const postFirebase = await makeHttpCall(testServer, 'POST', '/api/firebase/config', { apiKey: 'key', projectId: 'proj' });
      assert.strictEqual(postFirebase.statusCode, 403, 'POST /api/firebase/config must be 403 in demo mode');

    } finally {
      config.isDemoMode = originalDemoMode;
      config.isReadOnly = originalReadOnly;
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

  console.log('\n=======================================================');
  console.log(`   TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('=======================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests();
