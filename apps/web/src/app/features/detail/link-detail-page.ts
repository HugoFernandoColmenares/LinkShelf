import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CATEGORIES, type CategorySlug } from '@linkshelf/core';
import { firestoreErrorMessage } from '@linkshelf/firebase';
import { formatWhen } from '../../core/format';
import { LinksStore } from '../../core/links.store';
import { CategoryBadge } from '../../shared/ui/category-badge';
import { TagEditor } from '../../shared/ui/tag-editor';

@Component({
  selector: 'ls-link-detail-page',
  imports: [RouterLink, CategoryBadge, TagEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './link-detail-page.html',
})
export class LinkDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(LinksStore);
  readonly categories = CATEGORIES;
  readonly formatWhen = formatWhen;
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('confirm');

  readonly id = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly link = computed(() => this.store.byId(this.id()));
  readonly title = signal('');
  readonly category = signal<CategorySlug>('webpages');
  readonly tags = signal<string[]>([]);
  readonly note = signal('');
  readonly description = signal('');
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);
  readonly busy = signal(false);

  constructor() {
    this.route.paramMap.subscribe((params) => this.id.set(params.get('id') ?? ''));
    effect(() => {
      const link = this.link();
      if (!link) return;
      this.title.set(link.title);
      this.category.set(link.category);
      this.tags.set(link.tags);
      this.note.set(link.note ?? '');
      this.description.set(link.description ?? '');
    });
  }

  askRemove(): void {
    this.dialog()?.nativeElement.showModal();
  }

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      await this.store.update(this.id(), {
        title: this.title().trim(),
        category: this.category(),
        tags: this.tags(),
        note: this.note().trim() || null,
        description: this.description().trim() || null,
      });
      this.saved.set(true);
    } catch (error) {
      this.error.set(firestoreErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    this.dialog()?.nativeElement.close();
    try {
      await this.store.remove(this.id());
      await this.router.navigate(['/links']);
    } catch (error) {
      this.error.set(firestoreErrorMessage(error));
    }
  }

  onTitle(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.title.set(target.value);
  }

  onCategory(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) this.category.set(target.value as CategorySlug);
  }

  onNote(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) this.note.set(target.value);
  }

  onDescription(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) this.description.set(target.value);
  }
}
