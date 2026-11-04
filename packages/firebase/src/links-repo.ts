import type { CategorySlug, PreparedLink } from '@linkshelf/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { DuplicateError } from './errors';
import { parseLink, type Link, type LinkPatch } from './link';

export interface LinkChoice {
  category: CategorySlug;
  tags: string[];
  note?: string;
}

const EDITABLE: Array<keyof LinkPatch> = [
  'title',
  'category',
  'tags',
  'status',
  'favorite',
  'note',
  'description',
  'imageUrl',
  'metaStatus',
  'canonicalUrl',
];

export class LinksRepo {
  constructor(private readonly db: Firestore) {}

  async getById(uid: string, id: string): Promise<Link | null> {
    const snap = await getDoc(doc(this.db, 'users', uid, 'links', id));
    return snap.exists() ? parseLink(snap.id, snap.data()) : null;
  }

  async listAll(uid: string): Promise<Link[]> {
    const snap = await getDocs(collection(this.db, 'users', uid, 'links'));
    return snap.docs.map((item) => parseLink(item.id, item.data()));
  }

  async listByDomain(uid: string, domain: string, max = 100): Promise<Link[]> {
    const snap = await getDocs(
      query(
        collection(this.db, 'users', uid, 'links'),
        where('domain', '==', domain),
        orderBy('createdAt', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((item) => parseLink(item.id, item.data()));
  }

  async create(uid: string, prepared: PreparedLink, choice: LinkChoice): Promise<void> {
    const ref = doc(this.db, 'users', uid, 'links', prepared.id);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) throw new DuplicateError(parseLink(snap.id, snap.data()));
      tx.set(ref, {
        url: prepared.url,
        normalizedUrl: prepared.normalizedUrl,
        canonicalUrl: prepared.canonicalUrl,
        title: prepared.title,
        description: prepared.description,
        imageUrl: prepared.imageUrl,
        domain: prepared.domain,
        category: choice.category,
        suggestedCategory: prepared.suggestion.category,
        tags: choice.tags.slice(0, 10),
        keywords: prepared.keywords.slice(0, 60),
        status: 'unread',
        favorite: false,
        source: prepared.source,
        metaStatus: prepared.metaStatus,
        note: choice.note ?? null,
        importBatchId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  async update(uid: string, id: string, patch: LinkPatch): Promise<void> {
    const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const key of EDITABLE) {
      const value = patch[key];
      if (value !== undefined) data[key] = value;
    }
    await updateDoc(doc(this.db, 'users', uid, 'links', id), data);
  }

  async remove(uid: string, id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'users', uid, 'links', id));
  }

  /** Crea enlaces nuevos en lotes de 450 y deja el informe en importBatches. */
  async importMany(
    uid: string,
    report: { id: string; source: string; total: number; duplicates: number; failed: number },
    items: Array<{ prepared: PreparedLink; category: CategorySlug }>,
  ): Promise<number> {
    const chunkSize = 450;
    let created = 0;
    const writeReport = items.length === 0;
    if (writeReport) {
      const batch = writeBatch(this.db);
      batch.set(doc(this.db, 'users', uid, 'importBatches', report.id), {
        source: report.source,
        total: report.total,
        created: 0,
        duplicates: report.duplicates,
        failed: report.failed,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      return 0;
    }
    for (let index = 0; index < items.length; index += chunkSize) {
      const slice = items.slice(index, index + chunkSize);
      const batch = writeBatch(this.db);
      if (index === 0) {
        batch.set(doc(this.db, 'users', uid, 'importBatches', report.id), {
          source: report.source,
          total: report.total,
          created: items.length,
          duplicates: report.duplicates,
          failed: report.failed,
          createdAt: serverTimestamp(),
        });
      }
      for (const item of slice) {
        const prepared = item.prepared;
        batch.set(doc(this.db, 'users', uid, 'links', prepared.id), {
          url: prepared.url.slice(0, 2048),
          normalizedUrl: prepared.normalizedUrl,
          canonicalUrl: prepared.canonicalUrl,
          title: prepared.title.slice(0, 500),
          description: prepared.description,
          imageUrl: prepared.imageUrl,
          domain: prepared.domain,
          category: item.category,
          suggestedCategory: prepared.suggestion.category,
          tags: [],
          keywords: prepared.keywords.slice(0, 60),
          status: 'unread',
          favorite: false,
          source: 'import',
          metaStatus: 'pending',
          note: null,
          importBatchId: report.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      created += slice.length;
    }
    return created;
  }

  watch(
    uid: string,
    onChange: (links: Link[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const linksQuery = query(
      collection(this.db, 'users', uid, 'links'),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      linksQuery,
      (snap) => {
        onChange(snap.docs.map((item) => parseLink(item.id, item.data())));
      },
      (error) => onError?.(error),
    );
  }
}
