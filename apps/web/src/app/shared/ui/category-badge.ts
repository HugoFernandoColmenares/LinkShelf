import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { categoryBySlug, type CategorySlug } from '@linkshelf/core';

@Component({
  selector: 'ls-category-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [style.--badge]="color()">{{ name() }}</span>`,
})
export class CategoryBadge {
  readonly slug = input.required<CategorySlug>();
  readonly name = computed(() => categoryBySlug(this.slug())?.name ?? this.slug());
  readonly color = computed(() => categoryBySlug(this.slug())?.color ?? '#475569');
}
