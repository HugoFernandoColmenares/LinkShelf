import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CATEGORIES, isCategorySlug, matchesQuery, type CategorySlug } from '@linkshelf/core';
import { formatWhen } from '../../core/format';
import { LinksStore } from '../../core/links.store';
import { CategoryBadge } from '../../shared/ui/category-badge';
import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'ls-library-page',
  imports: [RouterLink, CategoryBadge, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './library-page.html',
})
export class LibraryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly store = inject(LinksStore);
  readonly categories = CATEGORIES;
  readonly formatWhen = formatWhen;

  readonly category = signal<CategorySlug | null>(null);
  readonly query = signal('');
  readonly domain = signal('');
  readonly tags = signal<string[]>([]);
  readonly tagMode = signal<'any' | 'all'>('any');
  readonly includeTags = signal(false);
  readonly from = signal('');
  readonly to = signal('');
  readonly visible = signal(30);

  readonly filtered = computed(() => {
    const category = this.category();
    const domain = this.domain();
    const tags = this.tags();
    const from = this.from() ? new Date(this.from()) : null;
    const to = this.to() ? new Date(`${this.to()}T23:59:59`) : null;
    return this.store.links().filter((link) => {
      if (category) {
        const byCategory = link.category === category;
        const byTag = this.includeTags() && link.tags.includes(category);
        if (!byCategory && !byTag) return false;
      }
      if (domain && link.domain !== domain) return false;
      if (tags.length > 0) {
        const matches =
          this.tagMode() === 'all'
            ? tags.every((tag) => link.tags.includes(tag))
            : tags.some((tag) => link.tags.includes(tag));
        if (!matches) return false;
      }
      if (from && link.createdAt && link.createdAt < from) return false;
      if (to && link.createdAt && link.createdAt > to) return false;
      return matchesQuery(link, this.query());
    });
  });

  readonly page = computed(() => this.filtered().slice(0, this.visible()));

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const cat = params.get('cat');
      this.category.set(cat && isCategorySlug(cat) ? cat : null);
      this.query.set(params.get('q') ?? '');
      this.domain.set(params.get('domain') ?? '');
      this.tags.set(
        (params.get('tags') ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      );
      this.tagMode.set(params.get('tagMode') === 'all' ? 'all' : 'any');
      this.includeTags.set(params.get('includeTags') === '1');
      this.from.set(params.get('from') ?? '');
      this.to.set(params.get('to') ?? '');
      this.visible.set(30);
    });
  }

  setParam(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }

  setCategory(slug: CategorySlug | null): void {
    this.setParam({ cat: slug });
  }

  toggleTag(tag: string): void {
    const next = this.tags().includes(tag)
      ? this.tags().filter((item) => item !== tag)
      : [...this.tags(), tag];
    this.setParam({ tags: next.length ? next.join(',') : null });
  }

  onDomain(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) this.setParam({ domain: target.value || null });
  }

  onDate(key: 'from' | 'to', event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.setParam({ [key]: target.value || null });
  }
}
