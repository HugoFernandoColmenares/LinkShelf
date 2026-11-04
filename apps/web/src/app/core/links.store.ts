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
  firestoreErrorMessage,
  LinksRepo,
  type Link,
  type LinkChoice,
  type LinkPatch,
} from '@linkshelf/firebase';
import { AuthService } from './auth.service';
import { firestore } from './firebase';

@Injectable({ providedIn: 'root' })
export class LinksStore {
  private readonly auth = inject(AuthService);
  private readonly repo = new LinksRepo(firestore);
  private stopWatch: (() => void) | null = null;

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
      const user = this.auth.user();
      this.stopWatch?.();
      this.stopWatch = null;
      if (!user) {
        this.links.set([]);
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      const stop = this.repo.watch(
        user.uid,
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
      this.stopWatch = stop;
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
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Inicia sesión para guardar.');
    await this.repo.create(uid, prepared, choice);
  }

  async update(id: string, patch: LinkPatch): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Inicia sesión para editar.');
    await this.repo.update(uid, id, patch);
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Inicia sesión para eliminar.');
    await this.repo.remove(uid, id);
  }

  uid(): string | null {
    return this.auth.user()?.uid ?? null;
  }

  importMany(
    report: { id: string; source: string; total: number; duplicates: number; failed: number },
    items: Array<{ prepared: PreparedLink; category: CategorySlug }>,
  ): Promise<number> {
    const uid = this.auth.user()?.uid;
    if (!uid) return Promise.reject(new Error('Inicia sesión para importar.'));
    return this.repo.importMany(uid, report, items);
  }
}
