import type { CategorySlug, PreparedLink } from '@linkshelf/core';
import type { BundleImportResult, LinkBundle } from './bundle';
import type { Link, LinkPatch } from './link';

export interface LinkChoice {
  category: CategorySlug;
  tags: string[];
  note?: string;
}

export interface ImportReport {
  id: string;
  source: string;
  total: number;
  duplicates: number;
  failed: number;
}

export interface LinkRepository {
  getById(uid: string, id: string): Promise<Link | null>;
  listAll(uid: string): Promise<Link[]>;
  listByDomain(uid: string, domain: string, max?: number): Promise<Link[]>;
  create(uid: string, prepared: PreparedLink, choice: LinkChoice): Promise<void>;
  update(uid: string, id: string, patch: LinkPatch): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
  importMany(
    uid: string,
    report: ImportReport,
    items: Array<{ prepared: PreparedLink; category: CategorySlug }>,
  ): Promise<number>;
  watch(
    uid: string,
    onChange: (links: Link[]) => void,
    onError?: (error: Error) => void,
  ): () => void;
  exportBundle(uid: string): Promise<LinkBundle>;
  importBundle(uid: string, bundle: unknown): Promise<BundleImportResult>;
}
