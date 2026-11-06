import { Injectable, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  DEMO_FALLBACK_MESSAGE,
  isAllowlistedAccount,
  PRIVATE_INSTANCE_MESSAGE,
  RULES_DENIED_MESSAGE,
} from '@linkshelf/firebase';
import { auth, environment, firestore, googleProvider } from './firebase';

export type ShelfMode = 'demo' | 'personal';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly mode = signal<ShelfMode>('demo');
  readonly ready = signal(false);
  readonly blockedNotice = signal<string | null>(null);
  readonly useEmulators = environment.useEmulators;
  private readyPromise: Promise<User | null>;
  private applyQueue: Promise<void> = Promise.resolve();

  constructor() {
    const timeout = globalThis.setTimeout(() => {
      if (!this.ready()) this.ready.set(true);
    }, 2000);
    this.readyPromise = new Promise((resolve) => {
      onAuthStateChanged(
        auth,
        (user) => {
          void this.enqueueApply(user).finally(() => {
            globalThis.clearTimeout(timeout);
            this.ready.set(true);
            resolve(this.user());
          });
        },
        () => {
          globalThis.clearTimeout(timeout);
          this.user.set(null);
          this.mode.set('demo');
          this.ready.set(true);
          resolve(null);
        },
      );
    });
  }

  waitUntilReady(): Promise<User | null> {
    return this.ready() ? Promise.resolve(this.user()) : this.readyPromise;
  }

  async signInGoogle(): Promise<ShelfMode> {
    this.blockedNotice.set(null);
    await signInWithPopup(auth, googleProvider);
    await this.enqueueApply(auth.currentUser);
    return this.mode();
  }

  async signInLocal(email: string, password: string): Promise<ShelfMode> {
    this.blockedNotice.set(null);
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
      } else {
        throw error;
      }
    }
    await this.enqueueApply(auth.currentUser);
    return this.mode();
  }

  async signOut(): Promise<void> {
    this.blockedNotice.set(null);
    await signOut(auth);
  }

  private enqueueApply(user: User | null): Promise<void> {
    const run = this.applyQueue.then(() => this.applyNow(user));
    this.applyQueue = run.catch(() => undefined);
    return run;
  }

  private async applyNow(user: User | null): Promise<void> {
    if (!user || auth.currentUser?.uid !== user.uid) {
      if (!user) {
        this.user.set(null);
        this.mode.set('demo');
      }
      return;
    }
    const allowed = isAllowlistedAccount(
      { uid: user.uid, email: user.email, emailVerified: user.emailVerified },
      environment.allowlist,
    );
    if (!allowed) {
      await this.fallBack(user, `${PRIVATE_INSTANCE_MESSAGE} ${DEMO_FALLBACK_MESSAGE}`);
      return;
    }
    try {
      await getDoc(doc(firestore, 'users', user.uid));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code.includes('permission-denied')) {
        await this.fallBack(user, `${RULES_DENIED_MESSAGE} ${DEMO_FALLBACK_MESSAGE}`);
        return;
      }
    }
    if (auth.currentUser?.uid !== user.uid) return;
    this.blockedNotice.set(null);
    this.user.set(user);
    this.mode.set('personal');
    await this.touchProfile(user);
  }

  private async fallBack(user: User, notice: string): Promise<void> {
    this.blockedNotice.set(notice);
    this.user.set(null);
    this.mode.set('demo');
    if (auth.currentUser?.uid === user.uid) await signOut(auth);
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
