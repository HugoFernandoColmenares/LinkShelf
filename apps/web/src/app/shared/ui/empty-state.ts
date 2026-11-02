import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ls-empty-state',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <p>{{ message() }}</p>
      @if (showSave()) {
        <a routerLink="/links/new" class="button">+ Guardar</a>
      }
    </div>
  `,
})
export class EmptyState {
  readonly message = input(
    'Aún no hay enlaces. Guarda el primero desde la extensión o con + Guardar.',
  );
  readonly showSave = input(true);
}
