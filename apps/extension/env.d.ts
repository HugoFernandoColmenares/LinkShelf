interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

declare const __LS_FIREBASE_CONFIG__: FirebasePublicConfig;
declare const __LS_USE_EMULATORS__: boolean;
declare const __LS_GOOGLE_CLIENT_ID__: string;
declare const __LS_AUTH_EMULATOR_URL__: string;
declare const __LS_FIRESTORE_HOST__: string;
declare const __LS_FIRESTORE_PORT__: number;
declare const __LS_SITE_URL__: string;
declare const __LS_ALLOWED_UIDS__: readonly string[];
declare const __LS_ALLOWED_EMAILS__: readonly string[];
