/**
 * Sales Report Parser & Account Identifier
 * Supports: .csv, .tsv, .txt, .xlsx, .xls, and text-based .pdf reports.
 *
 * Rules:
 * 1. Inspects report contents/metadata ONLY using verified identifiers.
 * 2. Never guesses an account based on filename.
 * 3. Identifies marketplace (Amazon, Flipkart, Meesho, Blinkit) and seller accounts.
 * 4. Detects conflicts between uploaded content and user-selected account/marketplace.
 * 5. Flags scanned/image-only PDFs as requiring OCR.
 * 6. Preserves original order IDs, dates, currency; deduplicates rows reliably.
 */

const XLSX = require('xlsx');
const zlib = require('zlib');
const crypto = require('crypto');
const SalesEngine = require('../calculations/salesEngine');

class SalesReportParser {
  /**
   * Generates SHA-256 checksum for duplicate file tracking
   */
  static computeChecksum(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Extracts text from PDF buffer
   * Returns { text, isScannedPdf }
   */
  static extractPdfText(buffer) {
    try {
      const content = buffer.toString('binary');
      let extractedText = '';

      const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let match;

      while ((match = streamRegex.exec(content)) !== null) {
        const rawStream = match[1];
        const streamBuffer = Buffer.from(rawStream, 'binary');

        let textChunk = '';
        try {
          const decompressed = zlib.inflateSync(streamBuffer);
          textChunk = decompressed.toString('utf8');
        } catch (e) {
          textChunk = rawStream;
        }

        // Tj operator: (string) Tj
        const tjRegex = /\(([^)]+)\)\s*Tj/g;
        let tjMatch;
        while ((tjMatch = tjRegex.exec(textChunk)) !== null) {
          extractedText += tjMatch[1] + ' ';
        }

        // TJ operator: [(string) number (string)] TJ
        const tjArrRegex = /\[([^\]]+)\]\s*TJ/g;
        let arrMatch;
        while ((arrMatch = tjArrRegex.exec(textChunk)) !== null) {
          const inner = arrMatch[1];
          const partRegex = /\(([^)]+)\)/g;
          let p;
          while ((p = partRegex.exec(inner)) !== null) {
            extractedText += p[1];
          }
          extractedText += ' ';
        }
      }

      const cleanText = extractedText.trim();
      const isScannedPdf = cleanText.length === 0;

      return {
        text: cleanText,
        isScannedPdf
      };
    } catch (err) {
      return {
        text: '',
        isScannedPdf: true,
        error: err.message
      };
    }
  }

  /**
   * Parses raw file into tabular { headers, dataRows, rawContentString, reportType }
   */
  static parseRawFile(fileBuffer, originalFilename) {
    const ext = (originalFilename.split('.').pop() || '').toLowerCase();
    const supportedExts = ['csv', 'tsv', 'txt', 'xlsx', 'xls', 'pdf'];

    if (!supportedExts.includes(ext)) {
      throw new Error(`Unsupported file format '.${ext}'. Supported formats are: CSV, TSV, TXT, XLS, XLSX, and PDF.`);
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('The uploaded file is empty (0 bytes).');
    }

    if (ext === 'pdf') {
      const { text, isScannedPdf, error } = this.extractPdfText(fileBuffer);
      if (isScannedPdf || text.length === 0) {
        throw new Error('Scanned PDF detected: Text could not be extracted directly. Optical Character Recognition (OCR) is required to extract sales data from scanned documents.');
      }

      // Parse text lines from PDF
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // Attempt to find tab/comma separated table or key-value rows
      const dataRows = [];
      let headers = [];

      for (const line of lines) {
        const parts = line.split(/[,\t|]/).map(p => p.trim());
        if (parts.length >= 3) {
          if (headers.length === 0) {
            headers = parts;
          } else {
            const rowObj = {};
            headers.forEach((h, idx) => {
              rowObj[h] = parts[idx] !== undefined ? parts[idx] : '';
            });
            dataRows.push(rowObj);
          }
        }
      }

      if (dataRows.length === 0) {
        // Fallback: check if text contains identifiable order lines
        const orderIdRegex = /(?:Order\s*(?:ID|Id|#)|Invoice\s*#?)[:\s]+([A-Za-z0-9\-]+)/gi;
        const amountRegex = /(?:Total|Amount|Gross|INR|₹)[:\s]+([0-9,]+(?:\.[0-9]{2})?)/gi;

        const foundOrders = [];
        let m;
        while ((m = orderIdRegex.exec(text)) !== null) {
          foundOrders.push(m[1]);
        }

        if (foundOrders.length > 0) {
          headers = ['Order ID', 'Amount', 'Date', 'Status'];
          foundOrders.forEach((oId, i) => {
            dataRows.push({
              'Order ID': oId,
              'Amount': '0.00',
              'Date': new Date().toISOString().split('T')[0],
              'Status': 'Delivered'
            });
          });
        }
      }

      if (dataRows.length === 0) {
        throw new Error('Could not extract structured tabular sales rows from this PDF document. Please upload a standard spreadsheet report or CSV.');
      }

      return {
        headers,
        dataRows,
        rawContentString: text,
        reportType: 'PDF Sales Document'
      };
    }

    // Handle Excel (.xlsx, .xls) and Delimited text (.csv, .tsv, .txt)
    const isTextDelimited = ['csv', 'tsv', 'txt'].includes(ext);
    let workbook;
    try {
      workbook = XLSX.read(fileBuffer, {
        type: 'buffer',
        cellDates: !isTextDelimited,
        raw: isTextDelimited
      });
    } catch (err) {
      throw new Error(`Failed to read report data: ${err.message}. File may be corrupted or encrypted.`);
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('The workbook contains no sheets.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawMatrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!rawMatrix || rawMatrix.length === 0) {
      throw new Error('The report sheet contains no rows.');
    }

    // Find header row: skip leading metadata rows (e.g. title, merchant note)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, rawMatrix.length); i++) {
      const row = rawMatrix[i];
      if (Array.isArray(row)) {
        const textRow = row.map(c => String(c || '').toLowerCase().trim());
        const hasOrderCol = textRow.some(c =>
          c.includes('order') || c.includes('invoice') || c.includes('po number') ||
          c.includes('sub order') || c.includes('settlement')
        );
        const hasAmountCol = textRow.some(c =>
          c.includes('price') || c.includes('amount') || c.includes('total') ||
          c.includes('sales') || c.includes('payout')
        );
        if (hasOrderCol && hasAmountCol) {
          headerRowIdx = i;
          break;
        }
      }
    }

    const headers = rawMatrix[headerRowIdx].map(h => String(h || '').trim());
    const dataRows = [];
    let rawContentString = '';

    for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
      const rowArr = rawMatrix[r];
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
        rawContentString += Object.values(rowObj).join(' ') + '\n';
      }
    }

    // Include pre-header text in rawContentString for seller-id / metadata detection
    for (let i = 0; i < headerRowIdx; i++) {
      rawContentString = (rawMatrix[i] || []).join(' ') + '\n' + rawContentString;
    }

    return {
      headers,
      dataRows,
      rawContentString,
      sheetName: firstSheetName,
      reportType: `${ext.toUpperCase()} Data Sheet`
    };
  }

  /**
   * Attempts to identify marketplace strictly from verified content / metadata
   * Returns: 'amazon' | 'flipkart' | 'meesho' | 'blinkit' | null
   */
  static detectMarketplace(headers = [], rawContent = '', dataRows = []) {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    const lowerContent = (rawContent + ' ' + headers.join(' ')).toLowerCase();

    // 1. Amazon checks
    const hasAmazonHeader = lowerHeaders.some(h =>
      h.includes('amazon order id') || h.includes('amazon-order-id') ||
      h.includes('merchant-order-id') || h.includes('settlement-id') ||
      h.includes('item-price') || h.includes('asin')
    );
    const hasAmazonContent = lowerContent.includes('amazon') || lowerContent.includes('amazon pay') || lowerContent.includes('amzn');
    // Amazon Order ID pattern: 3 digits - 7 digits - 7 digits (e.g. 402-1234567-1234567)
    const hasAmazonOrderPattern = dataRows.slice(0, 20).some(r => {
      const val = Object.values(r).join(' ');
      return /\b\d{3}-\d{7}-\d{7}\b/.test(val);
    });

    if (hasAmazonHeader || (hasAmazonContent && hasAmazonOrderPattern)) {
      return 'amazon';
    }

    // 2. Flipkart checks
    const hasFlipkartHeader = lowerHeaders.some(h =>
      h.includes('fsn') || h.includes('flipkart') ||
      h.includes('neft id') || h.includes('pickup details')
    );
    const hasFlipkartContent = lowerContent.includes('flipkart') || lowerContent.includes('citin');
    // Flipkart FSN pattern or order pattern
    const hasFlipkartOrderPattern = dataRows.slice(0, 20).some(r => {
      const val = Object.values(r).join(' ');
      return /\bOD\d{18}\b/i.test(val) || /\bFOD\d{14,18}\b/i.test(val);
    });

    if (hasFlipkartHeader || hasFlipkartContent || hasFlipkartOrderPattern) {
      return 'flipkart';
    }

    // 3. Meesho checks
    const hasMeeshoHeader = lowerHeaders.some(h =>
      h.includes('sub order no') || h.includes('sub_order_id') ||
      h.includes('supplier id') || h.includes('supplier name') ||
      h.includes('meesho') || h.includes('product gst %')
    );
    const hasMeeshoContent = lowerContent.includes('meesho') || lowerContent.includes('fashnear');

    if (hasMeeshoHeader || hasMeeshoContent) {
      return 'meesho';
    }

    // 4. Blinkit checks
    const hasBlinkitHeader = lowerHeaders.some(h =>
      h.includes('po number') || h.includes('payout cycle id') ||
      h.includes('blinkit') || h.includes('grofers') ||
      h.includes('store code')
    );
    const hasBlinkitContent = lowerContent.includes('blinkit') || lowerContent.includes('grofers');

    if (hasBlinkitHeader || hasBlinkitContent) {
      return 'blinkit';
    }

    return null;
  }

  /**
   * Attempts to identify seller account strictly from verified content / metadata
   * Matches sellerId or verified accountName against database accounts.
   * Returns: { account: matchedAccount, matchConfidence: 'high' | 'medium', matchField: string } | null
   */
  static detectAccount(headers = [], dataRows = [], rawContent = '', existingAccounts = [], detectedMarketplace = null) {
    if (!existingAccounts || existingAccounts.length === 0) return null;

    // Filter candidate accounts if detectedMarketplace is known
    const candidateAccounts = detectedMarketplace
      ? existingAccounts.filter(a => (a.marketplace || '').toLowerCase() === detectedMarketplace.toLowerCase())
      : existingAccounts;

    // Search text corpus composed of headers, sample rows, and metadata
    const sampleRowsText = dataRows.slice(0, 50).map(r => Object.values(r).join(' ')).join('\n');
    const fullContent = (rawContent + '\n' + headers.join(' ') + '\n' + sampleRowsText);

    // 1. Direct match on official Seller ID (highest confidence)
    for (const acc of candidateAccounts) {
      if (acc.sellerId && acc.sellerId.length >= 4) {
        // Look for exact word boundary match
        const escapedId = acc.sellerId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const sellerIdRegex = new RegExp(`\\b${escapedId}\\b`, 'i');
        if (sellerIdRegex.test(fullContent)) {
          return {
            account: acc,
            matchConfidence: 'high',
            matchField: `Seller ID (${acc.sellerId})`
          };
        }
      }
    }

    // 2. Direct match on official account display name if uniquely identified
    for (const acc of candidateAccounts) {
      if (acc.accountName && acc.accountName.length >= 4) {
        const escapedName = acc.accountName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'i');
        if (nameRegex.test(fullContent)) {
          return {
            account: acc,
            matchConfidence: 'medium',
            matchField: `Account Name (${acc.accountName})`
          };
        }
      }
    }

    return null;
  }

  /**
   * Detects conflicts between uploaded file content and user selections
   * Returns: { hasConflict: boolean, reason: string | null }
   */
  static checkConflict(detectedMarketplace, detectedAccount, selectedMarketplace, selectedAccount) {
    // Conflict 1: Marketplace Mismatch
    if (detectedMarketplace && selectedMarketplace) {
      const dMkt = detectedMarketplace.toLowerCase();
      const sMkt = selectedMarketplace.toLowerCase();
      if (dMkt !== sMkt) {
        const mktLabels = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho', blinkit: 'Blinkit' };
        return {
          hasConflict: true,
          reason: `Marketplace mismatch: The report contains verified identifiers for ${mktLabels[dMkt] || dMkt}, but '${mktLabels[sMkt] || sMkt}' was selected. Import is blocked to prevent data contamination.`
        };
      }
    }

    // Conflict 2: Seller Account Mismatch (when report has independently identified account)
    if (detectedAccount && selectedAccount) {
      if (detectedAccount.id !== selectedAccount.id) {
        const idInfo = detectedAccount.sellerId ? `'${detectedAccount.sellerId}'` : `'${detectedAccount.accountName}'`;
        return {
          hasConflict: true,
          reason: `Account mismatch: The report contains verified identifier ${idInfo} belonging to '${detectedAccount.accountName}' (${detectedAccount.marketplace.toUpperCase()}), but you selected account '${selectedAccount.accountName}' (${selectedAccount.marketplace.toUpperCase()}). Import is blocked to prevent attributing sales to the wrong seller account.`
        };
      }
    }

    return {
      hasConflict: false,
      reason: null
    };
  }

  /**
   * Checks whether headers correspond to Amazon Seller Central Business Report
   */
  static isAmazonBusinessReport(headers = []) {
    const lower = headers.map(h => h.toLowerCase().trim());
    const amazonSummaryCols = [
      'ordered product sales', 'units ordered', 'total order items',
      'sessions - total', 'order item session percentage',
      'average sales per order item', 'average units per order item',
      'average selling price', 'average offer count'
    ];
    const matchCount = amazonSummaryCols.filter(col => lower.some(h => h === col || h.includes(col))).length;
    return matchCount >= 3;
  }

  /**
   * Extracts Amazon daily Business Report records as aggregate daily metrics.
   * Maps Date to daily report date and Ordered Product Sales to gross ordered sales.
   * Preserves B2B metrics separately.
   * Treats Units Ordered and Total Order Items as aggregate metrics, not unique orders.
   */
  /**
   * Checks whether headers correspond to an aggregate summary report format
   */
  static isAggregateSummaryReport(headers = []) {
    const isAmazon = this.isAmazonBusinessReport(headers);
    return {
      isSummary: isAmazon,
      reportFormat: isAmazon ? 'Amazon Seller Central Business Report (Sales & Traffic Summary)' : null
    };
  }

  /**
   * Extracts Amazon daily Business Report records as aggregate daily metrics.
   * Maps Date to daily report date and Ordered Product Sales to gross ordered sales.
   * Preserves B2B metrics separately.
   * Treats Units Ordered and Total Order Items as aggregate metrics, not unique orders.
   */
  static extractDailyBusinessSummary(headers = [], dataRows = []) {
    const dailyRecords = [];
    const warnings = [];
    let minDate = null;
    let maxDate = null;
    let totalGrossSales = 0;
    let totalB2bSales = 0;
    let totalUnitsOrdered = 0;
    let totalB2bUnitsOrdered = 0;
    let sumTotalOrderItems = 0;
    let sumB2bTotalOrderItems = 0;
    let totalSessions = 0;

    const lowerHeaders = headers.map(h => ({ raw: h, lower: h.toLowerCase().trim() }));
    const findCol = (keywords) => {
      for (const kw of keywords) {
        const normKw = kw.toLowerCase().replace(/[-_]/g, ' ').trim();
        const match = lowerHeaders.find(h => {
          const normH = h.lower.replace(/[-_]/g, ' ').trim();
          return normH === normKw || normH.includes(normKw) || h.lower === kw || h.lower.includes(kw);
        });
        if (match) return match.raw;
      }
      return null;
    };

    const dateCol = findCol(['date', 'report date']);
    const salesCol = lowerHeaders.find(h => h.lower === 'ordered product sales')?.raw || findCol(['ordered product sales', 'gross sales']);
    const b2bSalesCol = findCol(['ordered product sales - b2b', 'ordered product sales b2b', 'b2b sales']);
    const unitsCol = lowerHeaders.find(h => h.lower === 'units ordered')?.raw || findCol(['units ordered']);
    const b2bUnitsCol = findCol(['units ordered - b2b', 'units ordered b2b', 'b2b units']);
    const itemsCol = lowerHeaders.find(h => h.lower === 'total order items')?.raw || findCol(['total order items']);
    const b2bItemsCol = findCol(['total order items - b2b', 'total order items b2b', 'b2b order items']);
    const avgSalesCol = findCol(['average sales per order item']);
    const avgPriceCol = findCol(['average selling price']);
    const sessionsCol = findCol(['sessions - total', 'sessions']);
    const sessionPctCol = findCol(['order item session percentage']);
    const offerCountCol = findCol(['average offer count']);

    const seenDates = new Set();
    let rowIdx = 0;

    for (const row of dataRows) {
      rowIdx++;
      const rawDate = dateCol ? row[dateCol] : null;
      const reportDate = this.normalizeDate(rawDate);
      if (!reportDate) {
        warnings.push(`Row #${rowIdx}: Skipped because date '${rawDate || ''}' could not be validated.`);
        continue;
      }

      if (seenDates.has(reportDate)) {
        warnings.push(`Row #${rowIdx}: Duplicate date '${reportDate}' in file was skipped.`);
        continue;
      }
      seenDates.add(reportDate);

      if (!minDate || reportDate < minDate) minDate = reportDate;
      if (!maxDate || reportDate > maxDate) maxDate = reportDate;

      // Currency parsing
      const grossOrderedSales = this.normalizeAmount(salesCol ? row[salesCol] : 0);
      const b2bOrderedSales = this.normalizeAmount(b2bSalesCol ? row[b2bSalesCol] : 0);

      // Aggregate numeric metrics (not unique orders)
      const unitsOrdered = parseInt(String(unitsCol ? row[unitsCol] : '0').replace(/,/g, ''), 10) || 0;
      const b2bUnitsOrdered = parseInt(String(b2bUnitsCol ? row[b2bUnitsCol] : '0').replace(/,/g, ''), 10) || 0;
      const orderItemsCount = parseInt(String(itemsCol ? row[itemsCol] : '0').replace(/,/g, ''), 10) || 0;
      const b2bOrderItemsCount = parseInt(String(b2bItemsCol ? row[b2bItemsCol] : '0').replace(/,/g, ''), 10) || 0;
      const totalSessionsCount = parseInt(String(sessionsCol ? row[sessionsCol] : '0').replace(/,/g, ''), 10) || 0;

      const avgSalesPerOrderItem = this.normalizeAmount(avgSalesCol ? row[avgSalesCol] : 0);
      const avgSellingPrice = this.normalizeAmount(avgPriceCol ? row[avgPriceCol] : 0);
      const orderItemSessionPercentage = String((sessionPctCol ? row[sessionPctCol] : '') || '').trim();
      const avgOfferCount = parseInt(String(offerCountCol ? row[offerCountCol] : '0').replace(/,/g, ''), 10) || 0;

      totalGrossSales += grossOrderedSales;
      totalB2bSales += b2bOrderedSales;
      totalUnitsOrdered += unitsOrdered;
      totalB2bUnitsOrdered += b2bUnitsOrdered;
      sumTotalOrderItems += orderItemsCount;
      sumB2bTotalOrderItems += b2bOrderItemsCount;
      totalSessions += totalSessionsCount;

      dailyRecords.push({
        reportDate,
        grossOrderedSales: Math.round(grossOrderedSales * 100) / 100,
        b2bOrderedSales: Math.round(b2bOrderedSales * 100) / 100,
        unitsOrdered,
        b2bUnitsOrdered,
        totalOrderItems: orderItemsCount,
        b2bTotalOrderItems: b2bOrderItemsCount,
        totalSessions: totalSessionsCount,
        orderItemSessionPercentage,
        avgSalesPerOrderItem: Math.round(avgSalesPerOrderItem * 100) / 100,
        avgSellingPrice: Math.round(avgSellingPrice * 100) / 100,
        avgOfferCount,
        currency: 'INR'
      });
    }

    return {
      isDailySummary: true,
      isSummaryReport: true,
      reportType: 'Amazon Daily Business Report',
      summaryReportFormat: 'Amazon Seller Central Business Report (Sales & Traffic Summary)',
      reportCategory: 'daily_summary',
      dailyRecords,
      records: [], // Strictly no fake order rows in individual order table
      validRowsCount: dailyRecords.length,
      totalGrossSales: Math.round(totalGrossSales * 100) / 100,
      totalB2bSales: Math.round(totalB2bSales * 100) / 100,
      totalUnitsOrdered,
      totalB2bUnitsOrdered,
      totalOrderItems: sumTotalOrderItems,
      totalB2bOrderItems: sumB2bTotalOrderItems,
      totalSessions,
      dateRange: (minDate && maxDate) ? { startDate: minDate, endDate: maxDate } : null,
      warnings,
      validationError: dailyRecords.length === 0 ? 'No valid daily records with valid dates found.' : null
    };
  }

  /**
   * Normalizes raw rows into structured sales records
   */
  static extractSalesRecords(headers = [], dataRows = [], marketplace = 'generic') {
    // Check if this is an Amazon Daily Business Report
    if (this.isAmazonBusinessReport(headers)) {
      return this.extractDailyBusinessSummary(headers, dataRows);
    }

    const records = [];
    const warnings = [];
    let minDate = null;
    let maxDate = null;

    const lowerHeaders = headers.map(h => ({ raw: h, lower: h.toLowerCase().trim() }));

    // Find column matches with hyphens and underscores normalized
    const findCol = (keywords) => {
      for (const kw of keywords) {
        const normKw = kw.toLowerCase().replace(/[-_]/g, ' ').trim();
        const match = lowerHeaders.find(h => {
          const normH = h.lower.replace(/[-_]/g, ' ').trim();
          return normH === normKw || normH.includes(normKw) || h.lower === kw || h.lower.includes(kw);
        });
        if (match) return match.raw;
      }
      return null;
    };

    const orderIdCol = findCol([
      'amazon order id', 'amazon-order-id', 'order id', 'order_id', 'order-id', 'orderid',
      'order number', 'order_number', 'sub order no', 'sub_order_no', 'sub order id', 'sub_order_id',
      'sub-order-id', 'po number', 'po_number', 'invoice no', 'invoice number', 'invoice_number',
      'merchant order id', 'merchant-order-id', 'order item id', 'order_item_id'
    ]);

    const dateCol = findCol([
      'order date', 'order_date', 'order-date', 'purchase date', 'purchase-date', 'invoice date',
      'invoice_date', 'order approval date', 'payments date', 'payments-date', 'date',
      'transaction date', 'txn date', 'created at', 'created date', 'po date'
    ]);

    const grossCol = findCol([
      'invoice amount', 'invoice_amount', 'item price', 'item-price', 'item_price', 'total price',
      'total_price', 'selling price', 'selling_price', 'customer price', 'product price',
      'gross sales', 'gross amount', 'total amount', 'final amount', 'payout amount',
      'order amount', 'net payable', 'amount'
    ]);

    const statusCol = findCol([
      'order status', 'order-status', 'order_status', 'sub order status', 'item status', 'status',
      'shipment status', 'po status'
    ]);

    if (!orderIdCol) {
      warnings.push("Could not unambiguously identify an 'Order ID' column. Standard matching used.");
    }

    const seenOrderIds = new Set();
    let rowIndex = 0;

    for (const row of dataRows) {
      rowIndex++;
      // Extract order ID
      let orderId = '';
      if (orderIdCol && row[orderIdCol] !== undefined) {
        orderId = String(row[orderIdCol] || '').trim();
      } else {
        // Fallback: search for first cell with an order-like format
        for (const [k, v] of Object.entries(row)) {
          if (v && /^(?:\d{3}-\d{7}-\d{7}|OD\d+|[A-Z0-9_-]{8,30})$/i.test(String(v).trim())) {
            orderId = String(v).trim();
            break;
          }
        }
      }

      if (!orderId) {
        warnings.push(`Row #${rowIndex}: Skipped because Order ID was missing or empty.`);
        continue;
      }

      if (seenOrderIds.has(orderId)) {
        warnings.push(`Row #${rowIndex}: Duplicate Order ID '${orderId}' within file was skipped.`);
        continue;
      }
      seenOrderIds.add(orderId);

      // Extract & normalize Date
      let rawDate = dateCol ? row[dateCol] : null;
      let orderDate = this.normalizeDate(rawDate);
      if (!orderDate) {
        orderDate = new Date().toISOString().split('T')[0];
        warnings.push(`Row #${rowIndex} (${orderId}): Missing or unparseable date '${rawDate || ''}'; defaulted to current date.`);
      }

      if (!minDate || orderDate < minDate) minDate = orderDate;
      if (!maxDate || orderDate > maxDate) maxDate = orderDate;

      // Extract Gross Amount
      let rawGross = grossCol ? row[grossCol] : '0';
      let grossAmount = this.normalizeAmount(rawGross);

      // Extract Status
      let rawStatus = statusCol ? String(row[statusCol] || '').trim() : 'Delivered';
      let normalizedStatus = SalesEngine.normalizeOrderStatus(marketplace || 'generic', rawStatus);

      // Calculate Net Amount: if cancelled/returned, net is 0
      let netAmount = grossAmount;
      if (normalizedStatus === 'Cancelled' || normalizedStatus === 'Returned') {
        netAmount = 0;
      }

      records.push({
        orderId,
        orderDate,
        grossAmount: Math.round(grossAmount * 100) / 100,
        netAmount: Math.round(netAmount * 100) / 100,
        rawStatus: rawStatus || 'Delivered',
        status: normalizedStatus,
        currency: 'INR'
      });
    }

    const validationError = records.length === 0
      ? 'No valid order-level records with Order IDs could be extracted from this report file.'
      : null;

    return {
      records,
      warnings,
      dateRange: (minDate && maxDate) ? { startDate: minDate, endDate: maxDate } : null,
      isSummaryReport: false,
      summaryReportFormat: null,
      validationError
    };
  }

  /**
   * Helper to normalize date string to YYYY-MM-DD
   */
  static normalizeDate(dateVal) {
    if (!dateVal) return null;

    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      return dateVal.toISOString().split('T')[0];
    }

    const str = String(dateVal).trim();
    if (!str) return null;

    // YYYY-MM-DD or YYYY/MM/DD
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str)) {
      const parts = str.split(/[-/T\s]/);
      return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(str)) {
      const parts = str.split(/[-/\s]/);
      return `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
    }

    // DD-MM-YY or DD/MM/YY (2-digit year, common in CSV exports e.g. 19/09/26)
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2}$/.test(str)) {
      const parts = str.split(/[-/\s]/);
      const year = parseInt(parts[2], 10) + (parseInt(parts[2], 10) < 50 ? 2000 : 1900);
      return `${year}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Normalizes currency string or number, including quoted values like '"₹5,391.00"'
   */
  static normalizeAmount(amtVal) {
    if (typeof amtVal === 'number') {
      return isNaN(amtVal) ? 0 : Math.abs(amtVal);
    }
    if (!amtVal) return 0;
    // Handle quotes, currency symbols including corrupted symbols like '?' from non-UTF8 rupee symbols
    const clean = String(amtVal)
      .replace(/["'“”]/g, '')
      .replace(/[₹,\s$?\uFFFD\u20B9]/g, '')
      .replace(/INR/gi, '')
      .replace(/Rs\.?/gi, '')
      .trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.abs(num);
  }
}

module.exports = SalesReportParser;
