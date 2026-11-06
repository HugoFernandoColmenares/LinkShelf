import { linkIdFor, type CategorySlug, type PreparedLink } from '@linkshelf/core';
import {
  bundleFromLinks,
  parseBundleEnvelope,
  parseStoredLink,
  storedIdMatches,
  type StoredLink,
} from './bundle';
import { buildDemoLinks } from './demo-seed';
import { DuplicateError } from './errors';
import { parseLink, type Link, type LinkPatch } from './link';
import type { KeyValueStorage } from './memory-storage';
import type { LinkChoice, LinkRepository } from './repository';

export const DEMO_OWNER_ID = 'local';
export const DEMO_STORAGE_KEY = 'linkshelf.demo.v1';

interface LocalLibrary {
  version: 1;
  seeded: boolean;
  links: StoredLink[];
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

function byCreatedDesc(a: Link, b: Link): number {
  return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
}

function asDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toLink(stored: StoredLink): Link {
  return parseLink(stored.id, {
    ...stored,
    createdAt: asDate(stored.createdAt),
    updatedAt: asDate(stored.updatedAt),
  });
}

function listenForStorage(key: string, onChange: () => void): () => void {
  const target = globalThis.window;
  if (!target) return () => undefined;
  const handler = (event: StorageEvent) => {
    if (event.key === key || event.key === null) onChange();
  };
  target.addEventListener('storage', handler);
  return () => target.removeEventListener('storage', handler);
}

/**
 * Demo library for one browser. The uid argument is part of LinkRepository and
 * is ignored: a public visitor has a single local collection.
 */
export class LocalLinkRepository implements LinkRepository {
  private readonly listeners = new Set<() => void>();
  private seeding: Promise<void> | null = null;

  constructor(private readonly storage: KeyValueStorage) {}

  async getById(_uid: string, id: string): Promise<Link | null> {
    const library = await this.readyLibrary();
    const found = library.links.find((link) => link.id === id);
    return found ? toLink(found) : null;
  }

  async listAll(_uid: string): Promise<Link[]> {
    const library = await this.readyLibrary();
    return library.links.map(toLink).sort(byCreatedDesc);
  }

  async listByDomain(_uid: string, domain: string, max = 100): Promise<Link[]> {
    const links = await this.listAll(_uid);
    return links.filter((link) => link.domain === domain).slice(0, max);
  }

  async create(_uid: string, prepared: PreparedLink, choice: LinkChoice): Promise<void> {
    const expected = await linkIdFor(prepared.normalizedUrl);
    if (expected !== prepared.id) throw new Error('El id no coincide con la URL normalizada.');
    const library = await this.readyLibrary();
    const existing = library.links.find((link) => link.id === prepared.id);
    if (existing) throw new DuplicateError(toLink(existing));
    const now = new Date().toISOString();
    library.links.push({
      id: prepared.id,
      url: prepared.url.slice(0, 2048),
      normalizedUrl: prepared.normalizedUrl,
      canonicalUrl: prepared.canonicalUrl,
      title: prepared.title.slice(0, 500),
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
      createdAt: now,
      updatedAt: now,
    });
    this.write(library);
  }

  async update(_uid: string, id: string, patch: LinkPatch): Promise<void> {
    const library = await this.readyLibrary();
    const index = library.links.findIndex((link) => link.id === id);
    const current = library.links[index];
    if (!current) throw new Error('Ese enlace ya no está.');
    const next: StoredLink = { ...current, updatedAt: new Date().toISOString() };
    for (const key of EDITABLE) {
      const value = patch[key];
      if (value !== undefined) {
        Object.assign(next, { [key]: value });
      }
    }
    library.links[index] = next;
    this.write(library);
  }

  async remove(_uid: string, id: string): Promise<void> {
    const library = await this.readyLibrary();
    const next = library.links.filter((link) => link.id !== id);
    if (next.length === library.links.length) return;
    this.write({ ...library, links: next });
  }

  async importMany(
    _uid: string,
    report: { id: string; source: string; total: number; duplicates: number; failed: number },
    items: Array<{ prepared: PreparedLink; category: CategorySlug }>,
  ): Promise<number> {
    void report;
    const library = await this.readyLibrary();
    let created = 0;
    for (const item of items) {
      if (library.links.some((link) => link.id === item.prepared.id)) continue;
      const now = new Date().toISOString();
      library.links.push({
        id: item.prepared.id,
        url: item.prepared.url.slice(0, 2048),
        normalizedUrl: item.prepared.normalizedUrl,
        canonicalUrl: item.prepared.canonicalUrl,
        title: item.prepared.title.slice(0, 500),
        description: item.prepared.description,
        imageUrl: item.prepared.imageUrl,
        domain: item.prepared.domain,
        category: item.category,
        suggestedCategory: item.prepared.suggestion.category,
        tags: [],
        keywords: item.prepared.keywords.slice(0, 60),
        status: 'unread',
        favorite: false,
        source: 'import',
        metaStatus: 'pending',
        note: null,
        importBatchId: null,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }
    this.write(library);
    return created;
  }

  watch(
    _uid: string,
    onChange: (links: Link[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    let active = true;
    const publish = () => {
      if (!active) return;
      try {
        onChange(this.read().links.map(toLink).sort(byCreatedDesc));
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('No se pudo leer el modo demo.'));
      }
    };
    this.listeners.add(publish);
    const stopExternal = listenForStorage(DEMO_STORAGE_KEY, publish);
    void this.ensureSeeded()
      .then(() => publish())
      .catch((error: unknown) => {
        if (!active) return;
        onError?.(error instanceof Error ? error : new Error('No se pudo preparar el modo demo.'));
      });
    return () => {
      active = false;
      this.listeners.delete(publish);
      stopExternal();
    };
  }

  async exportBundle(_uid: string) {
    const library = await this.readyLibrary();
    return bundleFromLinks(library.links.map(toLink).sort(byCreatedDesc));
  }

  async importBundle(_uid: string, bundle: unknown) {
    const envelope = parseBundleEnvelope(bundle);
    const library = await this.readyLibrary();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of envelope.links) {
      const stored = parseStoredLink(item);
      if (!stored || !(await storedIdMatches(stored))) {
        skipped += 1;
        continue;
      }
      const index = library.links.findIndex((link) => link.id === stored.id);
      if (index === -1) {
        library.links.push(stored);
        created += 1;
        continue;
      }
      const current = library.links[index];
      if (!current || current.normalizedUrl !== stored.normalizedUrl) {
        skipped += 1;
        continue;
      }
      library.links[index] = {
        ...stored,
        url: current.url,
        normalizedUrl: current.normalizedUrl,
        createdAt: current.createdAt,
        source: current.source,
      };
      updated += 1;
    }
    this.write({ ...library, seeded: true });
    return { created, updated, skipped };
  }

  private async readyLibrary(): Promise<LocalLibrary> {
    await this.ensureSeeded();
    return this.read();
  }

  private ensureSeeded(): Promise<void> {
    if (this.storage.getItem(DEMO_STORAGE_KEY) !== null) return Promise.resolve();
    if (!this.seeding) {
      this.seeding = buildDemoLinks()
        .then((links) => {
          if (this.storage.getItem(DEMO_STORAGE_KEY) === null) {
            this.write({ version: 1, seeded: true, links });
          }
        })
        .finally(() => {
          this.seeding = null;
        });
    }
    return this.seeding;
  }

  private read(): LocalLibrary {
    const raw = this.storage.getItem(DEMO_STORAGE_KEY);
    if (raw === null) return { version: 1, seeded: false, links: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        'No se pudo leer la biblioteca de este navegador. Si tienes un JSON exportado, impórtalo después de borrar los datos del sitio.',
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('links' in parsed) ||
      !Array.isArray(parsed.links)
    ) {
      throw new Error('La biblioteca local es de una versión no compatible.');
    }
    const links = parsed.links
      .map(parseStoredLink)
      .filter((link): link is StoredLink => link !== null);
    return { version: 1, seeded: true, links };
  }

  private write(library: LocalLibrary): void {
    try {
      this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...library, seeded: true }));
    } catch {
      throw new Error(
        'Este navegador no tiene espacio para más enlaces. Exporta el JSON y borra algunos.',
      );
    }
    for (const listener of this.listeners) listener();
  }
}
