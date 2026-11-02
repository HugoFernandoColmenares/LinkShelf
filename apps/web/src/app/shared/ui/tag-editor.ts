import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { slugifyTag } from '@linkshelf/core';

@Component({
  selector: 'ls-tag-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tags">
      <label [attr.for]="inputId">Etiquetas</label>
      <div class="tags__row">
        @for (tag of tags(); track tag) {
          <span class="chip">
            #{{ tag }}
            <button
              type="button"
              [attr.aria-label]="'Quitar etiqueta ' + tag"
              (click)="remove(tag)"
            >
              ×
            </button>
          </span>
        }
        <input
          [id]="inputId"
          [value]="draft()"
          maxlength="32"
          placeholder="nueva etiqueta"
          (input)="onDraft($event)"
          (keydown.enter)="add($event)"
        />
      </div>
      <p class="hint">Minúsculas, sin acentos, máximo 10. Enter para añadir.</p>
    </div>
  `,
})
export class TagEditor {
  readonly tags = input.required<string[]>();
  readonly tagsChange = output<string[]>();
  readonly draft = signal('');
  readonly inputId = `tags-${Math.random().toString(36).slice(2, 8)}`;

  onDraft(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.draft.set(target.value);
  }

  add(event: Event): void {
    event.preventDefault();
    const slug = slugifyTag(this.draft());
    if (!slug || this.tags().includes(slug) || this.tags().length >= 10) return;
    this.tagsChange.emit([...this.tags(), slug]);
    this.draft.set('');
  }

  remove(tag: string): void {
    this.tagsChange.emit(this.tags().filter((item) => item !== tag));
  }
}
