import { writeFileSync } from 'node:fs';

const destination = process.argv[2];
if (!destination) {
  console.error('Pass the destination path.');
  process.exit(1);
}

const secret = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!secret || !secret.trim()) {
  console.error('FIREBASE_SERVICE_ACCOUNT is empty.');
  process.exit(1);
}

let raw = secret.trim();
if (!raw.startsWith('{')) {
  raw = Buffer.from(raw, 'base64').toString('utf8').trim();
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT is not JSON or base64 JSON.');
  process.exit(1);
}

if (!parsed.client_email || !parsed.private_key) {
  console.error('Service account JSON is missing client_email or private_key.');
  process.exit(1);
}

writeFileSync(destination, JSON.stringify(parsed), { mode: 0o600 });
console.log('Service account file written.');
