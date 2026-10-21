/**
 * Authentication & Authorization Middleware
 * Enforces JWT validation and backend Role-Based Access Control (RBAC).
 */

const AuthService = require('./authService');
const { db, TABLES } = require('../db');
const config = require('../config');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Missing or invalid Bearer token.'
    });
  }

  const token = authHeader.split(' ')[1];
  const decoded = AuthService.verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session token. Please log in again.'
    });
  }

  // 1. Check for configured primary admin
  if (decoded.id === 'admin') {
    req.user = {
      id: 'admin',
      username: decoded.username || config.dashboardUsername,
      email: decoded.email || config.dashboardUsername,
      role: 'Admin',
      fullName: decoded.fullName || config.dashboardFullName
    };
    return next();
  }

  // 2. Check for database user
  const user = db.findById(TABLES.USERS, decoded.id);
  if (!user || user.status !== 'active') {
    return res.status(401).json({
      success: false,
      error: 'User account is no longer active.'
    });
  }

  req.user = {
    id: user.id,
    username: user.email,
    email: user.email,
    role: user.role,
    fullName: user.fullName
  };

  next();
}

/**
 * RBAC Permission Guard
 * @param {string[]} allowedRoles Array of allowed roles (e.g. ['Admin'], ['Admin', 'Accounts'])
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    if (config.isDemoMode && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return res.status(403).json({
        success: false,
        isDemoBlocked: true,
        error: 'Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access Denied: Requires one of [${allowedRoles.join(', ')}] roles. Your current role is '${req.user.role}'.`
      });
    }

    next();
  };
}

/**
 * Audit Trail Helper
 */
function logAudit(userId, action, entityType, entityId = null, details = {}) {
  try {
    db.insert(TABLES.AUDIT_LOGS, {
      userId: userId || 'system',
      action,
      entityType,
      entityId,
      detailsJson: JSON.stringify(details)
    });
  } catch (err) {
    console.error('[AUDIT] Failed to write audit record:', err.message);
  }
}

module.exports = {
  requireAuth,
  requireRole,
  logAudit
};
