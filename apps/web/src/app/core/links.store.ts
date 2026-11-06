import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  CATEGORIES,
  duplicateCheck,
  type CategorySlug,
  type DuplicateCheck,
  type LinkSummary,
  type PreparedLink,
} from '@linkshelf/core';
import {
  browserStorage,
  DEMO_OWNER_ID,
  firestoreErrorMessage,
  LinksRepo,
  LocalLinkRepository,
  type Link,
  type LinkBundle,
  type LinkChoice,
  type LinkPatch,
  type LinkRepository,
} from '@linkshelf/firebase';
import { AuthService } from './auth.service';
import { firestore } from './firebase';

@Injectable({ providedIn: 'root' })
export class LinksStore {
  private readonly auth = inject(AuthService);
  private readonly cloud = new LinksRepo(firestore);
  private readonly local = new LocalLinkRepository(browserStorage());

  readonly links = signal<Link[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly summaries = computed<LinkSummary[]>(() =>
    this.links().map((link) => ({
      id: link.id,
      title: link.title,
      normalizedUrl: link.normalizedUrl,
      domain: link.domain,
      category: link.category,
      canonicalUrl: link.canonicalUrl,
      createdAt: link.createdAt,
    })),
  );

  readonly categoryCounts = computed(() => {
    const counts = new Map<CategorySlug, number>();
    for (const category of CATEGORIES) counts.set(category.slug, 0);
    for (const link of this.links())
      counts.set(link.category, (counts.get(link.category) ?? 0) + 1);
    return counts;
  });

  readonly tagCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const link of this.links()) {
      for (const tag of link.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  });

  readonly domains = computed(() => [...new Set(this.links().map((link) => link.domain))].sort());

  constructor() {
    effect((onCleanup) => {
      if (!this.auth.ready()) return;
      const personal = this.auth.mode() === 'personal';
      const uid = personal ? this.auth.user()?.uid : DEMO_OWNER_ID;
      this.links.set([]);
      if (!uid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      this.error.set(null);
      const stop = this.repository().watch(
        uid,
        (links) => {
          this.links.set(links);
          this.loading.set(false);
          this.error.set(null);
        },
        (error) => {
          this.error.set(firestoreErrorMessage(error));
          this.loading.set(false);
        },
      );
      onCleanup(() => stop());
    });
  }

  byId(id: string): Link | undefined {
    return this.links().find((link) => link.id === id);
  }

  check(prepared: PreparedLink, title: string): DuplicateCheck {
    return duplicateCheck(
      {
        id: prepared.id,
        title,
        normalizedUrl: prepared.normalizedUrl,
        canonicalUrl: prepared.canonicalUrl,
        domain: prepared.domain,
      },
      this.summaries(),
    );
  }

  async save(prepared: PreparedLink, choice: LinkChoice): Promise<void> {
    await this.repository().create(this.requireUid(), prepared, choice);
  }

  async update(id: string, patch: LinkPatch): Promise<void> {
    await this.repository().update(this.requireUid(), id, patch);
  }

  async remove(id: string): Promise<void> {
    await this.repository().remove(this.requireUid(), id);
  }

  uid(): string | null {
    if (this.auth.mode() === 'personal') return this.auth.user()?.uid ?? null;
    return DEMO_OWNER_ID;
  }

  importMany(
    report: { id: string; source: string; total: number; duplicates: number; failed: number },
    items: Array<{ prepared: PreparedLink; category: CategorySlug }>,
  ): Promise<number> {
    const uid = this.uid();
    if (!uid) return Promise.reject(new Error('No hay una biblioteca activa.'));
    return this.repository().importMany(uid, report, items);
  }

  exportBundle(): Promise<LinkBundle> {
    return this.repository().exportBundle(this.requireUid());
  }

  importBundle(bundle: unknown) {
    return this.repository().importBundle(this.requireUid(), bundle);
  }

  private repository(): LinkRepository {
    return this.auth.mode() === 'personal' ? this.cloud : this.local;
  }

  private requireUid(): string {
    const uid = this.uid();
    if (!uid) throw new Error('No hay una biblioteca activa.');
    return uid;
  }
}
