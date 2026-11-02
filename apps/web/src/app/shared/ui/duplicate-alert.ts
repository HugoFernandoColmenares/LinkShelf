import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { categoryBySlug, type DuplicateCheck } from '@linkshelf/core';

@Component({
  selector: 'ls-duplicate-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (check().level !== 'none') {
      <div class="duplicate" role="alert" aria-live="polite">
        <p class="duplicate__title">
          @if (check().level === 'exact') {
            Ya guardaste este enlace
          } @else {
            Posible duplicado
          }
        </p>
        <ul>
          @for (match of check().matches.slice(0, 3); track match.id) {
            <li>
              <button type="button" (click)="open.emit(match.id)">
                {{ match.title }}
                <span>
                  {{ categoryName(match.category) }}
                  @if (check().level !== 'exact') {
                    · {{ percent(match.score) }}
                  }
                </span>
              </button>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class DuplicateAlert {
  readonly check = input.required<DuplicateCheck>();
  readonly open = output<string>();

  percent(score: number): string {
    return `${Math.round(score * 100)} %`;
  }

  categoryName(slug: DuplicateCheck['matches'][number]['category']): string {
    return slug ? (categoryBySlug(slug)?.name ?? slug) : '';
  }
}
