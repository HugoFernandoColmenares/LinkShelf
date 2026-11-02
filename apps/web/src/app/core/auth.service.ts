import { Injectable, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, environment, firestore, googleProvider } from './firebase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);
  readonly useEmulators = environment.useEmulators;
  private readyPromise: Promise<User | null>;

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      onAuthStateChanged(auth, (user) => {
        this.user.set(user);
        this.ready.set(true);
        resolve(user);
        if (user) void this.touchProfile(user);
      });
    });
  }

  waitUntilReady(): Promise<User | null> {
    return this.ready() ? Promise.resolve(this.user()) : this.readyPromise;
  }

  signInGoogle(): Promise<void> {
    return signInWithPopup(auth, googleProvider).then(() => undefined);
  }

  async signInLocal(email: string, password: string): Promise<void> {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        await createUserWithEmailAndPassword(auth, email, password);
        return;
      }
      throw error;
    }
  }

  signOut(): Promise<void> {
    return signOut(auth);
  }

  private async touchProfile(user: User): Promise<void> {
    try {
      await setDoc(
        doc(firestore, 'users', user.uid),
        {
          displayName: user.displayName ?? '',
          email: user.email ?? '',
          photoURL: user.photoURL,
          defaultCategory: 'webpages',
          theme: 'system',
          similarityThresholds: { probable: 0.8, possible: 0.6 },
          normalizerVersion: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch {
      // El perfil es auxiliar; la biblioteca no depende de que exista.
    }
  }
}
