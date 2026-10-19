const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole, logAudit } = require('../auth/middleware');
const SalesReportParser = require('../integrations/salesReportParser');
const { db, TABLES } = require('../db');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max limit
});

// Helper: Get imported daily business summaries list
function getDailyBusinessSummaries() {
  const setting = db.findOne(TABLES.SETTINGS, s => s.key === 'daily_business_summaries');
  if (setting && setting.value) {
    try {
      return JSON.parse(setting.value);
    } catch (e) {
      return [];
    }
  }
  return [];
}

// Helper: Save daily business summaries
function saveDailyBusinessSummaries(summaries) {
  const existing = db.findOne(TABLES.SETTINGS, s => s.key === 'daily_business_summaries');
  if (existing) {
    db.update(TABLES.SETTINGS, existing.id, { value: JSON.stringify(summaries) });
  } else {
    db.insert(TABLES.SETTINGS, {
      key: 'daily_business_summaries',
      value: JSON.stringify(summaries)
    });
  }
}

// Helper: Get imported file checksums list
function getImportedChecksums() {
  const setting = db.findOne(TABLES.SETTINGS, s => s.key === 'imported_sales_reports');
  if (setting && setting.value) {
    try {
      return JSON.parse(setting.value);
    } catch (e) {
      return [];
    }
  }
  return [];
}

// Helper: Save imported file checksum
function saveImportedChecksum(entry) {
  const current = getImportedChecksums();
  current.push(entry);
  const existing = db.findOne(TABLES.SETTINGS, s => s.key === 'imported_sales_reports');
  if (existing) {
    db.update(TABLES.SETTINGS, existing.id, { value: JSON.stringify(current) });
  } else {
    db.insert(TABLES.SETTINGS, {
      key: 'imported_sales_reports',
      value: JSON.stringify(current)
    });
  }
}

// 1. Get Accounts list for selection (optionally filtered by marketplace)
router.get('/accounts', requireAuth, (req, res) => {
  try {
    let accounts = db.find(TABLES.MARKETPLACE_ACCOUNTS);
    if (req.query.marketplace) {
      const m = req.query.marketplace.toLowerCase().trim();
      accounts = accounts.filter(a => a.marketplace.toLowerCase() === m);
    }
    const mapped = accounts.map(a => ({
      id: a.id,
      marketplace: a.marketplace,
      accountName: a.accountName,
      sellerId: a.sellerId || null,
      isVerified: !!a.isVerified,
      connectionStatus: a.connectionStatus,
      isDemo: a.isDemo
    }));
    res.json({ success: true, count: mapped.length, accounts: mapped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. Get Daily Business Summaries (aggregate metrics)
router.get('/daily-summaries', requireAuth, (req, res) => {
  try {
    let summaries = getDailyBusinessSummaries();
    if (req.query.marketplace) {
      const m = req.query.marketplace.toLowerCase().trim();
      summaries = summaries.filter(s => s.marketplace.toLowerCase() === m);
    }
    if (req.query.accountId) {
      summaries = summaries.filter(s => s.accountId === req.query.accountId);
    }
    res.json({ success: true, count: summaries.length, summaries });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Preview and Validate uploaded sales report
router.post('/preview', requireAuth, requireRole(['Admin', 'Accounts']), upload.single('reportFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please select a report file to upload.' });
    }

    const originalFilename = req.file.originalname;
    const buffer = req.file.buffer;

    // 1. Parse raw file
    const { headers, dataRows, rawContentString, reportType } = SalesReportParser.parseRawFile(buffer, originalFilename);

    if (dataRows.length === 0) {
      return res.status(400).json({ success: false, error: 'The report contains no valid data rows to extract.' });
    }

    // 2. Fetch existing accounts for detection and conflict checking
    const existingAccounts = db.find(TABLES.MARKETPLACE_ACCOUNTS);

    // 3. Detect Marketplace and Account strictly from content/metadata (NEVER filename)
    const detectedMarketplace = SalesReportParser.detectMarketplace(headers, rawContentString, dataRows);
    const accountMatch = SalesReportParser.detectAccount(headers, dataRows, rawContentString, existingAccounts, detectedMarketplace);
    const detectedAccount = accountMatch ? accountMatch.account : null;

    // 4. Check for conflict with user-selected options if provided
    const selectedMarketplace = req.body.marketplace || null;
    let selectedAccount = null;
    if (req.body.accountId) {
      selectedAccount = db.findById(TABLES.MARKETPLACE_ACCOUNTS, req.body.accountId) ||
                        db.findOne(TABLES.MARKETPLACE_ACCOUNTS, a => a.sellerId === req.body.accountId || a.id === req.body.accountId || (selectedMarketplace && a.marketplace.toLowerCase() === selectedMarketplace.toLowerCase() && a.accountName.toLowerCase() === req.body.accountId.toLowerCase()));
    }

    const effectiveMarketplace = detectedMarketplace || selectedMarketplace || 'generic';
    const conflictCheck = SalesReportParser.checkConflict(
      detectedMarketplace,
      detectedAccount,
      selectedMarketplace,
      selectedAccount
    );

    if (conflictCheck.hasConflict) {
      return res.status(400).json({
        success: false,
        hasConflict: true,
        error: conflictCheck.reason
      });
    }

    // 5. Extract sales records for preview
    const extraction = SalesReportParser.extractSalesRecords(headers, dataRows, effectiveMarketplace);
    const {
      records = [],
      dailyRecords = [],
      warnings = [],
      dateRange,
      isDailySummary = false,
      isSummaryReport = false,
      reportType: extractedReportType,
      summaryReportFormat,
      validationError,
      totalGrossSales,
      totalB2bSales,
      totalUnitsOrdered,
      totalOrderItems,
      totalSessions
    } = extraction;

    // 6. Check duplicate file
    const checksum = SalesReportParser.computeChecksum(buffer);
    const importedList = getImportedChecksums();
    const existingImport = importedList.find(item => item.checksum === checksum);

    const isIdentityVerified = !!(detectedAccount && selectedAccount && detectedAccount.id === selectedAccount.id);
    const verificationNotice = isIdentityVerified
      ? `Account identity verified via ${accountMatch.matchField}.`
      : (selectedAccount
          ? `Account identity has not been independently verified. Account name was selected manually as '${selectedAccount.accountName}'.`
          : null);

    const validRowsCount = isDailySummary ? dailyRecords.length : records.length;
    const canImport = validRowsCount > 0 && !conflictCheck.hasConflict && !!(selectedAccount || detectedAccount);

    res.json({
      success: true,
      filename: originalFilename,
      filesizeBytes: req.file.size,
      checksum,
      isDuplicateFile: !!existingImport,
      duplicateInfo: existingImport || null,
      detectedMarketplace,
      detectedAccount: detectedAccount ? {
        id: detectedAccount.id,
        accountName: detectedAccount.accountName,
        sellerId: detectedAccount.sellerId || null,
        marketplace: detectedAccount.marketplace,
        matchConfidence: accountMatch.matchConfidence,
        matchField: accountMatch.matchField
      } : null,
      accountAutoIdentified: !!detectedAccount,
      needsManualSelection: !detectedAccount && !selectedAccount,
      accountConfidence: accountMatch ? accountMatch.matchConfidence : 'none',
      selectedMarketplace: selectedMarketplace || (selectedAccount ? selectedAccount.marketplace : null),
      selectedAccount: selectedAccount ? {
        id: selectedAccount.id,
        accountName: selectedAccount.accountName,
        marketplace: selectedAccount.marketplace,
        sellerId: selectedAccount.sellerId || null,
        isVerified: isIdentityVerified
      } : null,
      accountIdentityVerified: isIdentityVerified,
      verificationNotice,
      hasConflict: false,
      conflictReason: null,
      reportType: extractedReportType || summaryReportFormat || reportType,
      isDailySummary: !!isDailySummary,
      reportCategory: isDailySummary ? 'daily_summary' : 'order_level',
      isSummaryReport: !!isSummaryReport,
      summaryReportFormat: summaryReportFormat || null,
      validationError: validationError || (validRowsCount === 0 ? 'No valid records found in this report.' : null),
      canImport,
      dateRange,
      totalRows: dataRows.length,
      validRowsCount,
      totalGrossSales: totalGrossSales !== undefined ? totalGrossSales : null,
      totalB2bSales: totalB2bSales !== undefined ? totalB2bSales : null,
      totalUnitsOrdered: totalUnitsOrdered !== undefined ? totalUnitsOrdered : null,
      totalOrderItems: totalOrderItems !== undefined ? totalOrderItems : null,
      totalSessions: totalSessions !== undefined ? totalSessions : null,
      previewDailyRows: isDailySummary ? dailyRecords.slice(0, 15) : null,
      previewRows: records.slice(0, 15),
      warnings: warnings.slice(0, 20)
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// 3. Confirm and Finalize Import of Sales Records
router.post('/import', requireAuth, requireRole(['Admin', 'Accounts']), upload.single('reportFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please select a report file to import.' });
    }

    const { accountId, marketplace } = req.body;
    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Seller account could not be determined. Please select the target seller account manually.'
      });
    }

    const targetAccount = db.findById(TABLES.MARKETPLACE_ACCOUNTS, accountId) ||
                          db.findOne(TABLES.MARKETPLACE_ACCOUNTS, a => a.sellerId === accountId || a.id === accountId || ((marketplace || '').toLowerCase() === a.marketplace.toLowerCase() && a.accountName.toLowerCase() === accountId.toLowerCase()));
    if (!targetAccount) {
      return res.status(400).json({ success: false, error: `Seller account ID '${accountId}' not found.` });
    }

    const buffer = req.file.buffer;
    const originalFilename = req.file.originalname;

    // Check duplicate file checksum
    const checksum = SalesReportParser.computeChecksum(buffer);
    const importedList = getImportedChecksums();
    const existingImport = importedList.find(item => item.checksum === checksum);

    if (existingImport && req.body.forceReimport !== 'true') {
      return res.status(409).json({
        success: false,
        isDuplicateFile: true,
        error: `This exact report file ('${existingImport.filename}') was already imported on ${existingImport.importedAt.split('T')[0]} for account '${existingImport.accountName}'. Re-importing identical files is blocked to prevent duplicate records.`
      });
    }

    // Parse file and verify conflicts
    const { headers, dataRows, rawContentString, reportType } = SalesReportParser.parseRawFile(buffer, originalFilename);
    const existingAccounts = db.find(TABLES.MARKETPLACE_ACCOUNTS);
    const detectedMarketplace = SalesReportParser.detectMarketplace(headers, rawContentString, dataRows);
    const accountMatch = SalesReportParser.detectAccount(headers, dataRows, rawContentString, existingAccounts, detectedMarketplace);
    const detectedAccount = accountMatch ? accountMatch.account : null;

    const conflictCheck = SalesReportParser.checkConflict(
      detectedMarketplace,
      detectedAccount,
      marketplace || targetAccount.marketplace,
      targetAccount
    );

    if (conflictCheck.hasConflict) {
      return res.status(400).json({
        success: false,
        hasConflict: true,
        error: conflictCheck.reason
      });
    }

    const effectiveMarketplace = targetAccount.marketplace || detectedMarketplace || 'generic';
    const extraction = SalesReportParser.extractSalesRecords(headers, dataRows, effectiveMarketplace);

    const isIdentityVerified = !!(detectedAccount && detectedAccount.id === targetAccount.id);

    // Branch A: Amazon Daily Business Summary Report Pipeline
    if (extraction.isDailySummary) {
      const dailyRecords = extraction.dailyRecords || [];
      if (dailyRecords.length === 0) {
        return res.status(400).json({
          success: false,
          error: extraction.validationError || 'No valid daily records with dates found to import.'
        });
      }

      const existingSummaries = getDailyBusinessSummaries();
      const newSummaries = [];
      let importedCount = 0;
      let skippedDuplicatesCount = 0;

      for (const rec of dailyRecords) {
        // Date-level deduplication: check platform + account + reportDate
        const isDuplicateDate = existingSummaries.some(s =>
          s.marketplace.toLowerCase() === effectiveMarketplace.toLowerCase() &&
          s.accountId === targetAccount.id &&
          s.reportDate === rec.reportDate
        );

        if (isDuplicateDate) {
          skippedDuplicatesCount++;
        } else {
          newSummaries.push({
            id: `daily_${effectiveMarketplace.toLowerCase()}_${targetAccount.id}_${rec.reportDate}`,
            marketplace: effectiveMarketplace.toLowerCase(),
            accountId: targetAccount.id,
            accountName: targetAccount.accountName,
            reportDate: rec.reportDate,
            grossOrderedSales: rec.grossOrderedSales,
            b2bOrderedSales: rec.b2bOrderedSales,
            unitsOrdered: rec.unitsOrdered,
            b2bUnitsOrdered: rec.b2bUnitsOrdered,
            totalOrderItems: rec.totalOrderItems,
            b2bTotalOrderItems: rec.b2bTotalOrderItems,
            totalSessions: rec.totalSessions,
            orderItemSessionPercentage: rec.orderItemSessionPercentage,
            avgSalesPerOrderItem: rec.avgSalesPerOrderItem,
            avgSellingPrice: rec.avgSellingPrice,
            avgOfferCount: rec.avgOfferCount,
            currency: rec.currency || 'INR',
            importedAt: new Date().toISOString(),
            fileChecksum: checksum
          });
          importedCount++;
        }
      }

      if (newSummaries.length > 0) {
        saveDailyBusinessSummaries([...existingSummaries, ...newSummaries]);
      }

      // Record imported file checksum entry in SETTINGS
      saveImportedChecksum({
        checksum,
        filename: originalFilename,
        filesize: req.file.size,
        accountId: targetAccount.id,
        accountName: targetAccount.accountName,
        marketplace: effectiveMarketplace,
        reportCategory: 'daily_summary',
        reportType: extraction.reportType,
        importedCount,
        skippedDuplicatesCount,
        totalGrossSales: extraction.totalGrossSales,
        totalB2bSales: extraction.totalB2bSales,
        totalUnitsOrdered: extraction.totalUnitsOrdered,
        totalOrderItems: extraction.totalOrderItems,
        dateRange: extraction.dateRange,
        importedAt: new Date().toISOString()
      });

      logAudit(req.user ? req.user.id : 'system', 'SALES_REPORT_IMPORTED', 'DAILY_BUSINESS_SUMMARIES', targetAccount.id, {
        filename: originalFilename,
        marketplace: effectiveMarketplace,
        reportType: extraction.reportType,
        importedCount,
        skippedDuplicatesCount,
        totalGrossSales: extraction.totalGrossSales,
        totalB2bSales: extraction.totalB2bSales,
        totalUnitsOrdered: extraction.totalUnitsOrdered,
        totalOrderItems: extraction.totalOrderItems,
        dateRange: extraction.dateRange
      });

      return res.json({
        success: true,
        isDailySummary: true,
        reportCategory: 'daily_summary',
        message: `Successfully imported ${importedCount} daily business summaries for '${targetAccount.accountName}' (${skippedDuplicatesCount} existing duplicate dates skipped). Zero fake order IDs generated.`,
        importedCount,
        skippedDuplicatesCount,
        totalRecordsInFile: dailyRecords.length,
        totalGrossSales: extraction.totalGrossSales,
        totalB2bSales: extraction.totalB2bSales,
        totalUnitsOrdered: extraction.totalUnitsOrdered,
        totalOrderItems: extraction.totalOrderItems,
        accountId: targetAccount.id,
        accountName: targetAccount.accountName,
        marketplace: effectiveMarketplace,
        accountIdentityVerified: isIdentityVerified,
        verificationNotice: isIdentityVerified
          ? `Account identity verified via ${accountMatch.matchField}.`
          : `Account identity has not been independently verified. Account '${targetAccount.accountName}' was selected manually.`,
        dateRange: extraction.dateRange
      });
    }

    // Branch B: Order-Level Report Import Pipeline (unchanged)
    const { records = [], warnings = [], dateRange, validationError } = extraction;

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        error: validationError || 'No valid order-level sales records could be extracted from this report file. Summary reports without Order IDs cannot be imported as orders.'
      });
    }

    // Insert records with row-level deduplication
    let importedCount = 0;
    let skippedDuplicatesCount = 0;

    for (const rec of records) {
      // Check if order already exists for this marketplace + account + orderId
      const existingOrder = db.findOne(TABLES.ORDERS, o =>
        o.marketplace.toLowerCase() === effectiveMarketplace.toLowerCase() &&
        o.accountId === targetAccount.id &&
        o.orderId === rec.orderId
      );

      if (existingOrder) {
        skippedDuplicatesCount++;
      } else {
        db.insert(TABLES.ORDERS, {
          marketplace: effectiveMarketplace.toLowerCase(),
          accountId: targetAccount.id,
          orderId: rec.orderId,
          orderDate: rec.orderDate,
          rawStatus: rec.rawStatus,
          status: rec.status,
          grossAmount: rec.grossAmount,
          netAmount: rec.netAmount,
          currency: 'INR',
          isDemo: false
        });
        importedCount++;
      }
    }

    // Record imported file checksum entry
    saveImportedChecksum({
      checksum,
      filename: originalFilename,
      filesize: req.file.size,
      accountId: targetAccount.id,
      accountName: targetAccount.accountName,
      marketplace: effectiveMarketplace,
      importedCount,
      skippedDuplicatesCount,
      dateRange,
      importedAt: new Date().toISOString()
    });

    logAudit(req.user ? req.user.id : 'system', 'SALES_REPORT_IMPORTED', 'ORDERS', targetAccount.id, {
      filename: originalFilename,
      marketplace: effectiveMarketplace,
      importedCount,
      skippedDuplicatesCount,
      dateRange
    });

    res.json({
      success: true,
      message: `Successfully imported ${importedCount} sales orders into '${targetAccount.accountName}' (${skippedDuplicatesCount} existing duplicate orders skipped).`,
      importedCount,
      skippedDuplicatesCount,
      totalRecordsInFile: records.length,
      accountId: targetAccount.id,
      accountName: targetAccount.accountName,
      marketplace: effectiveMarketplace,
      accountIdentityVerified: isIdentityVerified,
      verificationNotice: isIdentityVerified
        ? `Account identity verified via ${accountMatch.matchField}.`
        : `Account identity has not been independently verified. Account '${targetAccount.accountName}' was selected manually.`,
      dateRange
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
