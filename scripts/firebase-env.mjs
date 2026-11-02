import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadDotEnv(file = resolve(repoRoot, '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function resolveFirebaseEnv() {
  loadDotEnv();
  const apiKey = process.env.FIREBASE_API_KEY ?? '';
  const forceEmulators = process.env.FIREBASE_USE_EMULATORS === 'true';
  const useEmulators = forceEmulators || apiKey.length === 0;
  const projectId = useEmulators
    ? 'demo-linkshelf'
    : process.env.FIREBASE_PROJECT_ID || 'linkshelf-hugo';
  const authDomain = useEmulators
    ? 'demo-linkshelf.firebaseapp.com'
    : process.env.FIREBASE_AUTH_DOMAIN || 'linkshelf-hugo.firebaseapp.com';
  return {
    useEmulators,
    firebase: {
      apiKey: useEmulators ? 'demo-api-key' : apiKey,
      authDomain,
      projectId,
      storageBucket: useEmulators ? '' : (process.env.FIREBASE_STORAGE_BUCKET ?? ''),
      messagingSenderId: useEmulators ? '' : (process.env.FIREBASE_MESSAGING_SENDER_ID ?? ''),
      appId: useEmulators ? '1:0:web:demo' : (process.env.FIREBASE_APP_ID ?? ''),
    },
    siteUrl: process.env.SITE_URL || 'http://127.0.0.1:4200',
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    authEmulatorUrl: `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`,
    firestoreEmulatorHost:
      (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')[0] || '127.0.0.1',
    firestoreEmulatorPort: Number(
      (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')[1] || 8080,
    ),
  };
}
