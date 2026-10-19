/**
 * Vercel Serverless Function Entrypoint
 * Exposes the Cartman Express application for serverless invocation.
 */

const { app } = require('../src/server');

module.exports = app;
