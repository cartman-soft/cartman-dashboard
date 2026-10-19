const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth, requireRole, logAudit } = require('../auth/middleware');
const { BankParser } = require('../reconciliation/bankParser');
const Deduplicator = require('../reconciliation/deduplicator');
const ReconciliationMatcher = require('../reconciliation/matcher');
const { db, TABLES } = require('../db');
const config = require('../config');

// Memory storage for secure file inspection before saving
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB limit
});

// List supported bank profiles
router.get('/profiles', requireAuth, (req, res) => {
  res.json({
    success: true,
    profiles: BankParser.getBankProfilesList()
  });
});

// Step 1: Preview and Validate Uploaded Statement File
router.post('/preview', requireAuth, requireRole(['Admin', 'Accounts']), upload.single('statementFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please select a valid .xlsx or .csv statement file.' });
    }

    const { headers, dataRows, sheetName, totalRows } = BankParser.parseRawFile(req.file.buffer, req.file.originalname);
    const detectedProfileKey = BankParser.detectBankProfile(headers);

    // Compute checksum to check for duplicate statement upload
    const checksum = Deduplicator.computeFileChecksum(req.file.buffer);
    const existingStatement = Deduplicator.isDuplicateStatement(checksum);

    // Run preview normalization on top 10 rows
    const previewBatch = BankParser.normalizeStatementRows(dataRows.slice(0, 10), null, detectedProfileKey);

    res.json({
      success: true,
      filename: req.file.originalname,
      filesizeBytes: req.file.size,
      sheetName,
      totalRows,
      headers,
      detectedProfile: detectedProfileKey,
      isDuplicateFile: !!existingStatement,
      existingStatementId: existingStatement ? existingStatement.id : null,
      previewRows: previewBatch.records,
      previewErrors: previewBatch.errors
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: `File parsing error: ${err.message}. Please check if the file format matches a standard bank statement or download our sample template.`
    });
  }
});

// Step 2: Finalize Import of Statement
router.post('/import', requireAuth, requireRole(['Admin', 'Accounts']), upload.single('statementFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Missing statement file.' });
    }

    const bankName = req.body.bankName || 'Imported Bank Account';
    const profileKey = req.body.profileKey || 'generic';
    let mappingOverride = null;
    if (req.body.columnMapping) {
      try {
        mappingOverride = JSON.parse(req.body.columnMapping);
      } catch (e) {}
    }

    const checksum = Deduplicator.computeFileChecksum(req.file.buffer);
    const existingStatement = Deduplicator.isDuplicateStatement(checksum);

    if (existingStatement && req.body.allowDuplicateFile !== 'true') {
      return res.status(409).json({
        success: false,
        isDuplicateFile: true,
        error: `This exact file was already imported on ${existingStatement.createdAt.split('T')[0]} as Statement #${existingStatement.id}. To avoid double-counting, re-importing the identical file is blocked.`
      });
    }

    // Parse all rows
    const { headers, dataRows } = BankParser.parseRawFile(req.file.buffer, req.file.originalname);
    const { records, errors, totalCredits, totalDebits } = BankParser.normalizeStatementRows(dataRows, mappingOverride, profileKey);

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid transactions could be extracted from this statement.',
        errors
      });
    }

    // Check for duplicate transactions vs database
    const dedupResults = Deduplicator.checkTransactionDuplicates(records);

    // Save Statement Record
    const statement = db.insert(TABLES.BANK_STATEMENTS, {
      originalFilename: req.file.originalname,
      bankName,
      statementPeriod: `${records[0]?.transactionDate || ''} to ${records[records.length - 1]?.transactionDate || ''}`,
      totalRecords: records.length,
      totalCredits,
      totalDebits,
      status: 'processed',
      uploadedBy: req.user.fullName,
      fileChecksum: checksum
    });

    // Insert Transactions
    const txToInsert = dedupResults.records.map(rec => ({
      statementId: statement.id,
      transactionDate: rec.transactionDate,
      description: rec.description,
      referenceNo: rec.referenceNo,
      utrNo: rec.utrNo,
      debitAmount: rec.debitAmount,
      creditAmount: rec.creditAmount,
      balance: rec.balance,
      reconciliationStatus: rec.isDuplicate ? 'duplicate' : 'unmatched',
      isDuplicate: rec.isDuplicate,
      notes: rec.isDuplicate ? 'Duplicate transaction detected; skipped from automated matching.' : '',
      isDemo: false
    }));

    db.insertMany(TABLES.BANK_TRANSACTIONS, txToInsert);

    // Automatically trigger reconciliation matcher on newly ingested transactions
    const reconResults = ReconciliationMatcher.runReconciliation();

    logAudit(req.user.id, 'BANK_STATEMENT_IMPORTED', 'BANK_STATEMENT', statement.id, {
      filename: req.file.originalname,
      totalRecords: records.length,
      totalCredits,
      duplicateCount: dedupResults.duplicateCount,
      newlyMatchedSettlements: reconResults.newlyMatchedCount
    });

    res.json({
      success: true,
      message: `Statement imported successfully! Processed ${records.length} transactions.`,
      statementId: statement.id,
      importedCount: records.length - dedupResults.duplicateCount,
      duplicateCount: dedupResults.duplicateCount,
      totalCredits,
      totalDebits,
      autoMatchedCount: reconResults.newlyMatchedCount,
      validationWarnings: errors
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Statement Import History
router.get('/statements', requireAuth, (req, res) => {
  try {
    const list = db.find(TABLES.BANK_STATEMENTS);
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download Sample Templates (CSV & XLSX)
router.get('/template/csv', (req, res) => {
  const filePath = path.join(config.templatesDir, 'sample_bank_statement.csv');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'cartman_sample_bank_statement.csv');
  } else {
    res.status(404).json({ error: 'Sample template not found.' });
  }
});

router.get('/template/xlsx', (req, res) => {
  const filePath = path.join(config.templatesDir, 'sample_bank_statement.xlsx');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'cartman_sample_bank_statement.xlsx');
  } else {
    res.status(404).json({ error: 'Sample template not found.' });
  }
});

module.exports = router;
