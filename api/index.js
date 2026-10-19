/**
 * Vercel Serverless Function Entrypoint
 * Exposes the Cartman Express application for serverless invocation.
 */

// Explicitly ensure Vercel and demo mode environment flags before loading any app modules
process.env.VERCEL = process.env.VERCEL || '1';
process.env.DEMO_MODE = process.env.DEMO_MODE || 'true';

const { app } = require('../src/server');

module.exports = app;
