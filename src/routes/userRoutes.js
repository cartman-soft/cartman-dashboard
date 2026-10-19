const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, logAudit } = require('../auth/middleware');
const AuthService = require('../auth/authService');
const { db, TABLES } = require('../db');

// List Users (Admin only)
router.get('/', requireAuth, requireRole(['Admin']), (req, res) => {
  try {
    const users = db.find(TABLES.USERS).map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      otpEnabled: u.otpEnabled,
      createdAt: u.createdAt
    }));

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create User (Admin only)
router.post('/', requireAuth, requireRole(['Admin']), (req, res) => {
  try {
    const { email, fullName, role, password } = req.body;
    if (!email || !fullName || !role || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email, Full Name, Role, and Initial Password are required.'
      });
    }

    if (!['Admin', 'Accounts', 'Staff'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role. Must be Admin, Accounts, or Staff.' });
    }

    const passwordHash = AuthService.hashPassword(password);
    const user = db.insert(TABLES.USERS, {
      email: email.toLowerCase().trim(),
      fullName,
      role,
      passwordHash,
      status: 'active',
      otpEnabled: true
    });

    logAudit(req.user.id, 'USER_CREATED', 'USER', user.id, { email: user.email, role });

    res.json({
      success: true,
      message: `User '${fullName}' (${role}) created successfully.`,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update User Status or Role (Admin only)
router.put('/:id', requireAuth, requireRole(['Admin']), (req, res) => {
  try {
    const { id } = req.params;
    const { role, status, fullName, password } = req.body;

    const updates = {};
    if (role && ['Admin', 'Accounts', 'Staff'].includes(role)) updates.role = role;
    if (status && ['active', 'suspended'].includes(status)) updates.status = status;
    if (fullName) updates.fullName = fullName;
    if (password) updates.passwordHash = AuthService.hashPassword(password);

    const updated = db.update(TABLES.USERS, id, updates);

    logAudit(req.user.id, 'USER_UPDATED', 'USER', id, updates);

    res.json({
      success: true,
      message: 'User updated successfully.',
      data: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        status: updated.status
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get Roles & Permissions Matrix
router.get('/roles', requireAuth, (req, res) => {
  res.json({
    success: true,
    matrix: [
      {
        role: 'Admin',
        description: 'Complete operational and administrative ownership',
        permissions: [
          'Full Dashboard & Financial Visibility',
          'Manage Users & Assign Roles',
          'Configure Marketplace Accounts & Integration Credentials',
          'Upload & Reconcile Bank Statements',
          'Trigger & Configure Background Sync Schedules',
          'Export All Financial & Reconciliation Reports',
          'Access Audit Logs & Security Trails'
        ]
      },
      {
        role: 'Accounts',
        description: 'Financial management, settlement reconciliation & audits',
        permissions: [
          'Full Dashboard & Marketplace Sales Visibility',
          'Upload Bank Statements & Review Column Mappings',
          'Execute & Review Payment Reconciliations',
          'Perform Manual Transaction-to-Settlement Linkage',
          'Export Financial, Settlement, and Bank Reports',
          'Trigger Marketplace Synchronization'
        ]
      },
      {
        role: 'Staff',
        description: 'Operations and order management oversight',
        permissions: [
          'View Sales Overview & Order Status Counts',
          'View Marketplace Performance Cards',
          'Review Order Volume Trends',
          'Restricted from Sensitive Credentials, Secrets & User Administration'
        ]
      }
    ]
  });
});

module.exports = router;
