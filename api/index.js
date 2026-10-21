/**
 * Vercel Serverless Function Entrypoint
 * Exposes the Cartman Express application for serverless invocation.
 */

// Explicitly ensure Vercel environment flag before loading app modules
process.env.VERCEL = process.env.VERCEL || '1';

const { app } = require('../src/server');

module.exports = app;
