const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../auth/middleware');
const ExportService = require('../exports/exportService');

// Download Excel (.xlsx) Report
router.get('/excel', requireAuth, requireRole(['Admin', 'Accounts']), (req, res) => {
  try {
    const { period, date, month, startDate, endDate, includeDemo } = req.query;
    const filter = { period, date, month, startDate, endDate };
    const isDemo = includeDemo === undefined ? true : includeDemo === 'true';

    const buffer = ExportService.generateExcelReport(filter, isDemo, req.user.fullName);

    const filename = `Cartman_Sales_Payment_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download CSV (.csv) Report
router.get('/csv', requireAuth, requireRole(['Admin', 'Accounts']), (req, res) => {
  try {
    const { dimension = 'overview', period, date, month, startDate, endDate, includeDemo } = req.query;
    const filter = { period, date, month, startDate, endDate };
    const isDemo = includeDemo === undefined ? true : includeDemo === 'true';

    const csvContent = ExportService.generateCsvReport(dimension, filter, isDemo);

    const filename = `Cartman_${dimension}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Printable / PDF-Ready HTML Report View
router.get('/print', requireAuth, (req, res) => {
  try {
    const { period, date, month, startDate, endDate, includeDemo } = req.query;
    const filter = { period, date, month, startDate, endDate };
    const isDemo = includeDemo === undefined ? true : includeDemo === 'true';

    const html = ExportService.generatePrintableHtml(filter, isDemo, req.user.fullName);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h3>Error generating report: ${err.message}</h3>`);
  }
});

module.exports = router;
