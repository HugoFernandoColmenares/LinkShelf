import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const linkId = 'a'.repeat(64);
let env: RulesTestEnvironment;

function validLink(patch: Record<string, unknown> = {}) {
  return {
    url: 'https://example.com/post?utm_source=tldr',
    normalizedUrl: 'https://example.com/post',
    canonicalUrl: null,
    title: 'Un título',
    description: null,
    imageUrl: null,
    domain: 'example.com',
    category: 'tutoriales',
    suggestedCategory: 'tutoriales',
    tags: ['ia'],
    keywords: ['titulo'],
    status: 'unread',
    favorite: false,
    source: 'manual',
    metaStatus: 'pending',
    note: null,
    importBatchId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...patch,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-linkshelf',
    firestore: {
      rules: readFileSync(resolve('firebase/firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('firestore rules', () => {
  it('el dueño crea un enlace válido', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, `users/alice/links/${linkId}`), validLink()));
  });

  it('otro usuario no puede leer, crear, actualizar ni borrar', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    await assertSucceeds(setDoc(doc(alice, `users/alice/links/${linkId}`), validLink()));
    await assertFails(getDoc(doc(bob, `users/alice/links/${linkId}`)));
    await assertFails(setDoc(doc(bob, `users/alice/links/${'b'.repeat(64)}`), validLink()));
    await assertFails(
      updateDoc(doc(bob, `users/alice/links/${linkId}`), {
        title: 'Hack',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(bob, `users/alice/links/${linkId}`)));
  });

  it('sin sesión no se lee nada', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, `users/alice/links/${linkId}`), validLink()));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, `users/alice/links/${linkId}`)));
  });

  it('create rechaza id, categoría, tags, campos extra, título vacío y createdAt', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'users/alice/links/no-es-hash'), validLink()));
    await assertFails(setDoc(doc(alice, `users/alice/links/${'g'.repeat(64)}`), validLink()));
    await assertFails(
      setDoc(doc(alice, `users/alice/links/${linkId}`), validLink({ category: 'nope' })),
    );
    await assertFails(
      setDoc(
        doc(alice, `users/alice/links/${'c'.repeat(64)}`),
        validLink({ tags: Array.from({ length: 11 }, (_, index) => `t${index}`) }),
      ),
    );
    await assertFails(
      setDoc(doc(alice, `users/alice/links/${'d'.repeat(64)}`), validLink({ extra: true })),
    );
    await assertFails(
      setDoc(doc(alice, `users/alice/links/${'e'.repeat(64)}`), validLink({ title: '' })),
    );
    await assertFails(
      setDoc(
        doc(alice, `users/alice/links/${'f'.repeat(64)}`),
        validLink({ createdAt: new Date('2020-01-01') }),
      ),
    );
  });

  it('update rechaza cambiar url, normalizedUrl, createdAt o source', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, `users/alice/links/${linkId}`), validLink()));
    await assertSucceeds(
      updateDoc(doc(alice, `users/alice/links/${linkId}`), {
        title: 'Título nuevo',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(alice, `users/alice/links/${linkId}`), {
        normalizedUrl: 'https://evil.example/hack',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(alice, `users/alice/links/${linkId}`), {
        url: 'https://evil.example/hack',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(alice, `users/alice/links/${linkId}`), {
        source: 'import',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(alice, `users/alice/links/${linkId}`), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('reescribir un id existente como si fuera nuevo falla por inmutabilidad', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, `users/alice/links/${linkId}`), validLink()));
    await assertFails(
      setDoc(doc(alice, `users/alice/links/${linkId}`), validLink({ title: 'Otro' })),
    );
  });

  it('domainRules solo acepta categorías válidas y una ruta desconocida se niega', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(alice, 'users/alice/domainRules/example.com'), { category: 'ia', corrections: 3 }),
    );
    await assertFails(
      setDoc(doc(alice, 'users/alice/domainRules/example.com'), { category: 'nope' }),
    );
    await assertFails(setDoc(doc(alice, 'foo/bar'), { a: 1 }));
  });

  it('el dueño puede borrar su enlace y escribir su perfil', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, `users/alice/links/${linkId}`), validLink()));
    await assertSucceeds(deleteDoc(doc(alice, `users/alice/links/${linkId}`)));
    await assertSucceeds(
      setDoc(doc(alice, 'users/alice'), {
        displayName: 'Ada',
        email: 'ada@example.com',
        photoURL: null,
        defaultCategory: 'webpages',
        theme: 'system',
        similarityThresholds: { probable: 0.8, possible: 0.6 },
        normalizerVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
