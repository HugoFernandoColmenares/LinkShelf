import { browser } from 'wxt/browser';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth/web-extension';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';

function createApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  const config = __LS_FIREBASE_CONFIG__;
  return initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    ...(config.appId ? { appId: config.appId } : {}),
    ...(config.messagingSenderId ? { messagingSenderId: config.messagingSenderId } : {}),
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
  });
}

function createAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: indexedDBLocalPersistence });
  } catch {
    return getAuth(app);
  }
}

const app = createApp();
export const auth = createAuth(app);
export const db: Firestore = initializeFirestore(app, { localCache: memoryLocalCache() });

if (__LS_USE_EMULATORS__) {
  connectAuthEmulator(auth, __LS_AUTH_EMULATOR_URL__, { disableWarnings: true });
  connectFirestoreEmulator(db, __LS_FIRESTORE_HOST__, __LS_FIRESTORE_PORT__);
}

export function watchUser(onUser: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onUser);
}

export async function signInWithGoogle(): Promise<void> {
  if (!__LS_GOOGLE_CLIENT_ID__) {
    throw new Error('Configura GOOGLE_OAUTH_CLIENT_ID para el login con Google.');
  }
  const nonce = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: __LS_GOOGLE_CLIENT_ID__,
    response_type: 'id_token',
    redirect_uri: browser.identity.getRedirectURL(),
    scope: 'openid email profile',
    nonce,
    prompt: 'select_account',
  }).toString();
  const redirect = await browser.identity.launchWebAuthFlow({
    url: url.toString(),
    interactive: true,
  });
  const idToken = new URLSearchParams(new URL(redirect ?? '').hash.slice(1)).get('id_token');
  if (!idToken) throw new Error('Login cancelado');
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

export async function signInLocal(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (
      code.includes('user-not-found') ||
      code.includes('invalid-credential') ||
      code.includes('invalid-login')
    ) {
      await createUserWithEmailAndPassword(auth, email, password);
      return;
    }
    throw error;
  }
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

export const useEmulators = __LS_USE_EMULATORS__;
export const siteUrl = __LS_SITE_URL__;
