import { defineConfig } from 'wxt';
// @ts-expect-error Script de Node sin declaraciones; lo ejecuta WXT en el build.
import { resolveFirebaseEnv } from '../../scripts/firebase-env.mjs';

const env = resolveFirebaseEnv();

export default defineConfig({
  manifest: ({ browser: target }) => ({
    name: 'LinkShelf',
    description: 'Guarda, limpia y categoriza enlaces sin duplicados.',
    permissions: ['activeTab', 'contextMenus', 'storage', 'notifications', 'identity', 'alarms'],
    optional_permissions: ['bookmarks'],
    host_permissions: [
      'https://firestore.googleapis.com/*',
      'https://identitytoolkit.googleapis.com/*',
      'https://securetoken.googleapis.com/*',
      'http://127.0.0.1:8080/*',
      'http://127.0.0.1:9099/*',
      'http://localhost:8080/*',
      'http://localhost:9099/*',
    ],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: { default_title: 'LinkShelf' },
    commands: {
      _execute_action: {
        description: 'Guardar la pestaña actual en LinkShelf',
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'MacCtrl+Shift+S' },
      },
    },
    ...(target === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'linkshelf@linkshelf.local', strict_min_version: '128.0' },
          },
        }
      : {}),
  }),
  vite: () => ({
    define: {
      __LS_FIREBASE_CONFIG__: JSON.stringify(env.firebase),
      __LS_USE_EMULATORS__: JSON.stringify(env.useEmulators),
      __LS_GOOGLE_CLIENT_ID__: JSON.stringify(env.googleClientId),
      __LS_AUTH_EMULATOR_URL__: JSON.stringify(env.authEmulatorUrl),
      __LS_FIRESTORE_HOST__: JSON.stringify(env.firestoreEmulatorHost),
      __LS_FIRESTORE_PORT__: JSON.stringify(env.firestoreEmulatorPort),
      __LS_SITE_URL__: JSON.stringify(env.siteUrl),
      __LS_ALLOWED_UIDS__: JSON.stringify(env.allowlist.uids),
      __LS_ALLOWED_EMAILS__: JSON.stringify(env.allowlist.emails),
    },
  }),
});
