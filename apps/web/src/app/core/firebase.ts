import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import { connectAuthEmulator } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';

const firebaseConfig = {
  apiKey: environment.firebase.apiKey,
  authDomain: environment.firebase.authDomain,
  projectId: environment.firebase.projectId,
  ...(environment.firebase.appId ? { appId: environment.firebase.appId } : {}),
  ...(environment.firebase.messagingSenderId
    ? { messagingSenderId: environment.firebase.messagingSenderId }
    : {}),
  ...(environment.firebase.storageBucket
    ? { storageBucket: environment.firebase.storageBucket }
    : {}),
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const firestore = initializeFirestore(app, {
  localCache: environment.useEmulators
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (environment.useEmulators) {
  connectAuthEmulator(auth, environment.authEmulatorUrl, { disableWarnings: true });
  connectFirestoreEmulator(
    firestore,
    environment.firestoreEmulatorHost,
    environment.firestoreEmulatorPort,
  );
}

void setPersistence(auth, browserLocalPersistence);

export const googleProvider = new GoogleAuthProvider();
export { environment };
