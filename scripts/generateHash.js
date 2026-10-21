#!/usr/bin/env node
/**
 * Cartman Dashboard - Credential & Salted Hash Generator
 *
 * Generates a secure salted bcrypt password hash and JWT secret.
 * Usage:
 *   node scripts/generateHash.js [password] [username]
 *   node scripts/generateHash.js "mySecurePassword123" "my_username"
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const readline = require('readline');

function generateCredentials(password, username = 'admin') {
  const saltRounds = 10;
  const salt = bcrypt.genSaltSync(saltRounds);
  const passwordHash = bcrypt.hashSync(password, salt);
  const jwtSecret = crypto.randomBytes(32).toString('hex');

  console.log('\n=======================================================');
  console.log('   CARTMAN SECURE CREDENTIAL GENERATION');
  console.log('=======================================================');
  console.log(`Username:              ${username}`);
  console.log(`Password Hash (Bcrypt): ${passwordHash}`);
  console.log(`Generated JWT Secret:  ${jwtSecret}`);
  console.log('=======================================================\n');

  console.log('--- FOR LOCAL ENVIRONMENT (.env) ---');
  console.log(`DASHBOARD_USERNAME=${username}`);
  console.log(`DASHBOARD_PASSWORD_HASH=${passwordHash}`);
  console.log(`JWT_SECRET=${jwtSecret}`);

  console.log('\n--- FOR VERCEL DEPLOYMENT ---');
  console.log('Go to: Vercel Dashboard -> Project Settings -> Environment Variables');
  console.log('Add the following variables:');
  console.log(`  1. DASHBOARD_USERNAME       = ${username}`);
  console.log(`  2. DASHBOARD_PASSWORD_HASH  = ${passwordHash}`);
  console.log(`  3. JWT_SECRET               = ${jwtSecret}`);
  console.log('=======================================================\n');

  return { username, passwordHash, jwtSecret };
}

const args = process.argv.slice(2);
if (require.main === module) {
  if (args[0]) {
    generateCredentials(args[0], args[1] || 'admin');
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Enter desired Dashboard Username [admin]: ', (inputUser) => {
      const user = inputUser.trim() || 'admin';
      rl.question('Enter desired Dashboard Password: ', (inputPass) => {
        if (!inputPass || !inputPass.trim()) {
          console.error('Error: Password cannot be empty.');
          rl.close();
          process.exit(1);
        }
        generateCredentials(inputPass.trim(), user);
        rl.close();
      });
    });
  }
}

module.exports = { generateCredentials };
