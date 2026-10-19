/**
 * Firebase & Vercel Integration Verification Test
 */

const assert = require('assert');
const { app } = require('../src/server');
const vercelEntrypoint = require('../api/index');

console.log('\n--- Testing Firebase & Vercel Architecture ---');

// 1. Verify Vercel Serverless Entrypoint exports Express app
assert.strictEqual(typeof vercelEntrypoint, 'function', 'Vercel serverless entrypoint must export the Express application');
assert.strictEqual(vercelEntrypoint, app, 'api/index.js must export the configured app instance');
console.log('  ✓ Vercel serverless entrypoint correctly configured and linked');

// 2. Verify Firebase routes are registered
const routes = app._router.stack
  .filter(r => r.route || (r.name === 'router' && r.regexp))
  .map(r => r.regexp.toString());

const hasFirebaseRoute = routes.some(r => r.includes('firebase'));
assert.strictEqual(hasFirebaseRoute, true, 'Firebase API route must be registered in the Express app');
console.log('  ✓ Firebase configuration route /api/firebase registered successfully');

console.log('  ✓ Firebase & Vercel verification completed with 0 errors\n');
