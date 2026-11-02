import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CATEGORIES,
  InvalidUrlError,
  buildKeywords,
  prepareLink,
  strippedTrackingParamNames,
  type CategorySlug,
  type PreparedLink,
} from '@linkshelf/core';
import { DuplicateError, firestoreErrorMessage } from '@linkshelf/firebase';
import { LinksStore } from '../../core/links.store';
import { DuplicateAlert } from '../../shared/ui/duplicate-alert';
import { TagEditor } from '../../shared/ui/tag-editor';

@Component({
  selector: 'ls-save-link-page',
  imports: [RouterLink, DuplicateAlert, TagEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './save-link-page.html',
})
export class SaveLinkPage {
  private readonly store = inject(LinksStore);
  private readonly router = inject(Router);
  readonly categories = CATEGORIES;

  readonly url = signal('');
  readonly title = signal('');
  readonly category = signal<CategorySlug>('webpages');
  readonly tags = signal<string[]>([]);
  readonly note = signal('');
  readonly prepared = signal<PreparedLink | null>(null);
  readonly savedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly lowConfidence = signal(false);

  readonly stripped = computed(() => strippedTrackingParamNames(this.url()));
  readonly duplicate = computed(() => {
    const prepared = this.prepared();
    if (!prepared) return null;
    return this.store.check(prepared, this.title() || prepared.title);
  });

  async review(event?: Event): Promise<void> {
    event?.preventDefault();
    this.error.set(null);
    this.savedId.set(null);
    this.busy.set(true);
    try {
      const typedTitle = this.title().trim();
      const prepared = await prepareLink(
        typedTitle ? { url: this.url(), title: typedTitle } : { url: this.url() },
      );
      this.prepared.set(prepared);
      this.title.set(prepared.title);
      this.category.set(prepared.suggestion.category);
      this.tags.set(prepared.suggestion.tags);
      this.lowConfidence.set(prepared.suggestion.lowConfidence);
    } catch (error) {
      this.prepared.set(null);
      this.error.set(error instanceof InvalidUrlError ? error.message : 'No se pudo leer la URL.');
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    const prepared = this.prepared();
    const duplicate = this.duplicate();
    if (!prepared || duplicate?.level === 'exact') return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const title = this.title().trim() || prepared.title;
      await this.store.save(
        { ...prepared, title, keywords: buildKeywords(title) },
        {
          category: this.category(),
          tags: this.tags(),
          ...(this.note().trim() ? { note: this.note().trim() } : {}),
        },
      );
      this.savedId.set(prepared.id);
    } catch (error) {
      if (error instanceof DuplicateError) {
        this.error.set('Ya guardaste este enlace.');
        return;
      }
      this.error.set(firestoreErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async mergeTags(): Promise<void> {
    const duplicate = this.duplicate();
    const match = duplicate?.matches[0];
    if (!match) return;
    const existing = this.store.byId(match.id);
    if (!existing) return;
    const tags = [...new Set([...existing.tags, ...this.tags()])].slice(0, 10);
    await this.store.update(match.id, { tags });
    await this.router.navigate(['/links', match.id]);
  }

  onCategory(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) this.category.set(target.value as CategorySlug);
  }

  onTitle(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.title.set(target.value);
  }

  onNote(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) this.note.set(target.value);
  }

  existingId(): string | null {
    return this.duplicate()?.matches[0]?.id ?? null;
  }

  open(id: string): void {
    void this.router.navigate(['/links', id]);
  }

  onUrl(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.url.set(target.value);
      this.prepared.set(null);
      this.savedId.set(null);
    }
  }
}
