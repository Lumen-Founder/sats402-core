#!/usr/bin/env node
const major = Number(process.versions.node.split('.')[0]);
console.log('SATS-402 Doctor');
console.log(`Node: ${process.version}`);
if (major < 20) {
  console.error('Node >= 20 is required.');
  process.exit(1);
}
console.log('Node version OK.');
console.log('No third-party runtime dependencies.');
console.log('Run: npm run dev');
