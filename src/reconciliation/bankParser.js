/**
 * Bank Statement Parser & Column Normalizer
 * Supports Excel (.xlsx, .xls) and CSV (.csv) files.
 * Includes predefined mapping profiles for major Indian banks:
 * - HDFC Bank
 * - ICICI Bank
 * - State Bank of India (SBI)
 * - Axis Bank
 * - Kotak Mahindra Bank
 * - Standard / Generic Cartman Template
 */

const XLSX = require('xlsx');

const BANK_PROFILES = {
  generic: {
    name: 'Cartman Standard Template',
    dateCol: ['Date', 'Transaction Date', 'Txn Date'],
    descCol: ['Description', 'Narration', 'Particulars', 'Remarks'],
    refCol: ['Reference No', 'Ref No', 'UTR', 'UTR No', 'Cheque No', 'Chq No'],
    creditCol: ['Credit', 'Deposit', 'Credit Amount', 'Cr Amount', 'CR'],
    debitCol: ['Debit', 'Withdrawal', 'Debit Amount', 'Dr Amount', 'DR'],
    balanceCol: ['Balance', 'Closing Balance', 'Net Balance']
  },
  hdfc: {
    name: 'HDFC Bank Corporate / Current Account',
    dateCol: ['Date', 'Txn Date'],
    descCol: ['Narration'],
    refCol: ['Chq/Ref No', 'Reference Number'],
    creditCol: ['Deposit Amt', 'Deposit Amount', 'CR'],
    debitCol: ['Withdrawal Amt', 'Withdrawal Amount', 'DR'],
    balanceCol: ['Closing Balance', 'Balance']
  },
  icici: {
    name: 'ICICI Bank Current Account',
    dateCol: ['Transaction Date', 'Value Date'],
    descCol: ['Transaction Remarks', 'Remarks'],
    refCol: ['Cheque Number', 'Ref No', 'UTR'],
    creditCol: ['Credit Amount', 'Credit Amount (INR)', 'Credit'],
    debitCol: ['Debit Amount', 'Debit Amount (INR)', 'Debit'],
    balanceCol: ['Balance (INR)', 'Balance']
  },
  sbi: {
    name: 'State Bank of India (SBI)',
    dateCol: ['Txn Date', 'Txn Post Date'],
    descCol: ['Description'],
    refCol: ['Ref No./Cheque No.', 'Ref No'],
    creditCol: ['Credit', 'Credit Amount'],
    debitCol: ['Debit', 'Debit Amount'],
    balanceCol: ['Balance']
  },
  axis: {
    name: 'Axis Bank Current Account',
    dateCol: ['Tran Date', 'Transaction Date'],
    descCol: ['PARTICULARS', 'Particulars'],
    refCol: ['CHQNO', 'Ref No', 'UTR No'],
    creditCol: ['CR', 'Credit Amount'],
    debitCol: ['DR', 'Debit Amount'],
    balanceCol: ['BAL', 'Balance']
  },
  kotak: {
    name: 'Kotak Mahindra Bank',
    dateCol: ['Date', 'Transaction Date'],
    descCol: ['Narration'],
    refCol: ['Chq / Ref No', 'Reference No'],
    creditCol: ['Amount', 'Credit Amount'],
    debitCol: ['Debit Amount'],
    balanceCol: ['Balance']
  }
};

class BankParser {
  /**
   * Parse an uploaded file buffer into raw JSON rows
   */
  static parseRawFile(fileBuffer, originalFilename = '') {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Parse as 2D array first to detect header row
    const rawMatrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) {
      throw new Error('The uploaded file appears to be completely empty.');
    }

    // Find header row (usually contains Date/Txn Date/Narration)
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(rawMatrix.length, 15); r++) {
      const row = rawMatrix[r].map(c => String(c).trim().toLowerCase());
      const hasDate = row.some(cell => cell.includes('date'));
      const hasAmountOrDesc = row.some(cell => cell.includes('amount') || cell.includes('credit') || cell.includes('narration') || cell.includes('particular') || cell.includes('deposit'));
      if (hasDate && hasAmountOrDesc) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx === -1) {
      // Fallback: assume first non-empty row is header
      headerRowIdx = 0;
    }

    const headers = rawMatrix[headerRowIdx].map(h => String(h || '').trim());
    const dataRows = [];

    for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
      const rowArr = rawMatrix[r];
      // Skip empty rows
      if (!rowArr || rowArr.every(c => c === '' || c === null || c === undefined)) continue;

      const rowObj = {};
      let hasAnyValue = false;
      headers.forEach((h, colIdx) => {
        if (h) {
          const val = rowArr[colIdx] !== undefined ? rowArr[colIdx] : '';
          rowObj[h] = val;
          if (val !== '') hasAnyValue = true;
        }
      });
      if (hasAnyValue) {
        dataRows.push(rowObj);
      }
    }

    return {
      headers,
      dataRows,
      sheetName: firstSheetName,
      totalRows: dataRows.length
    };
  }

  /**
   * Automatically detect bank format based on headers
   */
  static detectBankProfile(headers) {
    const lowerHeaders = headers.map(h => h.toLowerCase());

    for (const [key, profile] of Object.entries(BANK_PROFILES)) {
      if (key === 'generic') continue;
      const dateMatch = profile.dateCol.some(c => lowerHeaders.includes(c.toLowerCase()));
      const descMatch = profile.descCol.some(c => lowerHeaders.includes(c.toLowerCase()));
      const creditMatch = profile.creditCol.some(c => lowerHeaders.includes(c.toLowerCase()));

      if (dateMatch && descMatch && creditMatch) {
        return key;
      }
    }
    return 'generic';
  }

  /**
   * Helper to parse and normalize date string to YYYY-MM-DD
   */
  static normalizeDate(dateVal) {
    if (!dateVal) return null;

    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      return dateVal.toISOString().split('T')[0];
    }

    const str = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.split('T')[0].substring(0, 10);
    }

    // Handle DD/MM/YYYY or DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
    if (dmy) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      const year = dmy[3];
      return `${year}-${month}-${day}`;
    }

    // Handle DD-MMM-YYYY (e.g. 15-Apr-2026)
    const dMmmY = str.match(/^(\d{1,2})[/\-.]([A-Za-z]{3})[/\-.](\d{4})/);
    if (dMmmY) {
      const day = dMmmY[1].padStart(2, '0');
      const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
      const mStr = dMmmY[2].toLowerCase();
      const month = months[mStr] || '01';
      return `${dMmmY[3]}-${month}-${day}`;
    }

    return null;
  }

  /**
   * Helper to parse currency amount
   */
  static normalizeAmount(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;

    let str = String(val).replace(/,/g, '').replace(/₹/g, '').replace(/INR/gi, '').trim();
    if (str.endsWith('Cr') || str.endsWith('CR')) {
      str = str.replace(/cr/gi, '').trim();
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }

  /**
   * Normalize parsed rows using selected or detected column mapping
   */
  static normalizeStatementRows(dataRows, mappingOverride = null, profileKey = 'generic') {
    const profile = BANK_PROFILES[profileKey] || BANK_PROFILES.generic;
    const mapping = mappingOverride || {};

    const normalizedRecords = [];
    const errors = [];

    dataRows.forEach((row, idx) => {
      const rowNum = idx + 2; // Accounting for 1-based index + header

      // Find Date
      const dateKey = mapping.date || profile.dateCol.find(c => row[c] !== undefined);
      const rawDate = row[dateKey];
      const normDate = this.normalizeDate(rawDate);

      // Find Description
      const descKey = mapping.description || profile.descCol.find(c => row[c] !== undefined);
      const description = String(row[descKey] || '').trim();

      // Find Reference / UTR
      const refKey = mapping.reference || profile.refCol.find(c => row[c] !== undefined);
      let referenceNo = String(row[refKey] || '').trim();

      // Attempt to extract UTR from description if reference is empty
      let utrNo = referenceNo;
      if (!utrNo && description) {
        const utrMatch = description.match(/(?:UTR|CMS|NEFT|RTGS|IMPS|UPI)[/\-:\s]*([A-Z0-9]{10,22})/i) ||
                         description.match(/\b([A-Z]{4}\d{6,14})\b/i);
        if (utrMatch) {
          utrNo = utrMatch[1];
        }
      }

      // Find Credit Amount
      const creditKey = mapping.credit || profile.creditCol.find(c => row[c] !== undefined);
      const creditAmount = this.normalizeAmount(row[creditKey]);

      // Find Debit Amount
      const debitKey = mapping.debit || profile.debitCol.find(c => row[c] !== undefined);
      const debitAmount = this.normalizeAmount(row[debitKey]);

      // Find Balance
      const balKey = mapping.balance || profile.balanceCol.find(c => row[c] !== undefined);
      const balance = this.normalizeAmount(row[balKey]);

      if (!normDate) {
        errors.push(`Row ${rowNum}: Unable to parse a valid transaction date from '${rawDate}'`);
        return;
      }

      if (creditAmount === 0 && debitAmount === 0) {
        // Skip zero amount rows (e.g. system markers)
        return;
      }

      normalizedRecords.push({
        rowNumber: rowNum,
        transactionDate: normDate,
        description,
        referenceNo: referenceNo || utrNo || '',
        utrNo: utrNo || referenceNo || '',
        creditAmount,
        debitAmount,
        balance,
        rawRow: row
      });
    });

    return {
      records: normalizedRecords,
      errors,
      totalParsed: normalizedRecords.length,
      totalCredits: normalizedRecords.reduce((sum, r) => sum + r.creditAmount, 0),
      totalDebits: normalizedRecords.reduce((sum, r) => sum + r.debitAmount, 0)
    };
  }

  static getBankProfilesList() {
    return Object.entries(BANK_PROFILES).map(([key, prof]) => ({
      key,
      name: prof.name,
      sampleHeaders: {
        date: prof.dateCol[0],
        description: prof.descCol[0],
        reference: prof.refCol[0],
        credit: prof.creditCol[0],
        debit: prof.debitCol[0],
        balance: prof.balanceCol[0]
      }
    }));
  }
}

module.exports = {
  BankParser,
  BANK_PROFILES
};
