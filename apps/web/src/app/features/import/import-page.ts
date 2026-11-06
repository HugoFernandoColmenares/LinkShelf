import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CATEGORIES,
  draftBookmarkImport,
  isCategorySlug,
  parseBookmarkHtml,
  prepareLink,
  type BookmarkDraft,
  type CategorySlug,
  type ParsedBookmark,
} from '@linkshelf/core';
import { firestoreErrorMessage } from '@linkshelf/firebase';
import { LinksStore } from '../../core/links.store';

@Component({
  selector: 'ls-import-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import-page.html',
})
export class ImportPage {
  private readonly store = inject(LinksStore);
  readonly categories = CATEGORIES;
  readonly drafts = signal<BookmarkDraft[]>([]);
  readonly bookmarks = signal<ParsedBookmark[]>([]);
  readonly mapping = signal<Record<string, string>>({});
  readonly includePossible = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly report = signal<string | null>(null);

  readonly folders = computed(() => [...new Set(this.drafts().map((item) => item.folderKey))]);

  readonly counts = computed(() => {
    const drafts = this.drafts();
    return {
      total: drafts.length,
      fresh: drafts.filter((item) => item.status === 'new').length,
      exact: drafts.filter((item) => item.status === 'exact').length,
      near: drafts.filter((item) => item.status === 'possible' || item.status === 'probable')
        .length,
      invalid: drafts.filter((item) => item.status === 'invalid').length,
    };
  });

  readonly preview = computed(() => this.drafts().slice(0, 40));

  async onFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    this.error.set(null);
    this.report.set(null);
    const text = await input.files[0].text();
    const parsed = parseBookmarkHtml(text);
    this.bookmarks.set(parsed);
    const drafts = await draftBookmarkImport(parsed, this.store.summaries());
    this.drafts.set(drafts);
    const mapping: Record<string, string> = {};
    for (const draft of drafts) {
      if (mapping[draft.folderKey] === undefined)
        mapping[draft.folderKey] = draft.suggestedCategory;
    }
    this.mapping.set(mapping);
  }

  setFolder(folder: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.mapping.update((current) => ({ ...current, [folder]: target.value }));
  }

  folderValue(folder: string): string {
    return this.mapping()[folder] ?? 'webpages';
  }

  categoryFor(draft: BookmarkDraft): CategorySlug {
    const chosen = this.folderValue(draft.folderKey);
    return isCategorySlug(chosen) ? chosen : draft.suggestedCategory;
  }

  statusLabel(status: BookmarkDraft['status']): string {
    if (status === 'new') return 'Nuevo';
    if (status === 'exact') return 'Duplicado exacto';
    if (status === 'probable') return 'Duplicado probable';
    if (status === 'possible') return 'Posible duplicado';
    return 'Omitido';
  }

  async confirm(): Promise<void> {
    const uid = this.store.uid();
    if (!uid) {
      this.error.set('No hay una biblioteca activa.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const selected = this.drafts().filter(
        (item) =>
          item.status === 'new' ||
          (this.includePossible() && (item.status === 'possible' || item.status === 'probable')),
      );
      const byUrl = new Map(this.bookmarks().map((item) => [item.url, item]));
      const items = [];
      for (const draft of selected) {
        const source = byUrl.get(draft.url);
        if (!source) continue;
        const prepared = await prepareLink({
          url: source.url,
          title: source.title,
          source: 'import',
        });
        items.push({ prepared, category: this.categoryFor(draft) });
      }
      const counts = this.counts();
      const created = await this.store.importMany(
        {
          id: crypto.randomUUID(),
          source: 'html',
          total: counts.total,
          duplicates: counts.exact + (this.includePossible() ? 0 : counts.near),
          failed: counts.invalid,
        },
        items,
      );
      this.report.set(
        `Listo: ${created} nuevos, ${counts.exact} duplicados exactos omitidos, ${this.includePossible() ? 0 : counts.near} posibles omitidos.`,
      );
    } catch (error) {
      this.error.set(firestoreErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
