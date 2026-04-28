#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('.env.mutinynet.example');
const dest = path.resolve('.env.mutinynet');
if (fs.existsSync(dest)) {
  console.log('.env.mutinynet already exists; not overwriting.');
  process.exit(0);
}
fs.copyFileSync(src, dest);
console.log('Created .env.mutinynet. Fill in three LND REST URLs plus macaroon/tls paths, then run:');
console.log('  npm run mutinynet:doctor');
