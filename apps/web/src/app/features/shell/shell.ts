import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { downloadJson } from '../../core/download';
import { LinksStore } from '../../core/links.store';

type Theme = 'system' | 'light' | 'dark';

@Component({
  selector: 'ls-shell',
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
})
export class Shell {
  readonly auth = inject(AuthService);
  private readonly store = inject(LinksStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly email = signal('');
  readonly query = signal('');
  readonly theme = signal<Theme>(this.readTheme());
  readonly personal = computed(() => this.auth.mode() === 'personal');
  readonly notice = signal<string | null>(null);
  readonly portabilityError = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.email.set(this.auth.user()?.email ?? '');
      document.documentElement.dataset['theme'] = this.theme();
      localStorage.setItem('linkshelf-theme', this.theme());
    });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.query.set(this.route.snapshot.queryParamMap.get('q') ?? ''));
    this.query.set(this.route.snapshot.queryParamMap.get('q') ?? '');
    this.destroyRef.onDestroy(() => document.removeEventListener('keydown', this.onKey));
    document.addEventListener('keydown', this.onKey);
  }

  onQuery(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.query.set(target.value);
    void this.router.navigate(['/links'], {
      queryParams: { q: target.value || null },
      queryParamsHandling: 'merge',
    });
  }

  cycleTheme(): void {
    const order: Theme[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(this.theme()) + 1) % order.length] ?? 'system';
    this.theme.set(next);
  }

  themeLabel(): string {
    if (this.theme() === 'light') return 'Tema claro';
    if (this.theme() === 'dark') return 'Tema oscuro';
    return 'Tema del sistema';
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/links']);
  }

  async exportJson(): Promise<void> {
    this.portabilityError.set(null);
    try {
      const bundle = await this.store.exportBundle();
      const day = new Date().toISOString().slice(0, 10);
      downloadJson(`linkshelf-${day}.json`, bundle);
      this.notice.set('JSON exportado. Guárdalo para conservar esta biblioteca.');
    } catch (error) {
      this.portabilityError.set(error instanceof Error ? error.message : 'No se pudo exportar.');
    }
  }

  async importJson(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    this.portabilityError.set(null);
    this.notice.set(null);
    try {
      const text = await input.files[0].text();
      const result = await this.store.importBundle(JSON.parse(text) as unknown);
      this.notice.set(
        `Listo: ${result.created} nuevos, ${result.updated} actualizados, ${result.skipped} omitidos.`,
      );
    } catch (error) {
      this.portabilityError.set(
        error instanceof Error ? error.message : 'No se pudo importar el JSON.',
      );
    } finally {
      input.value = '';
    }
  }

  private readTheme(): Theme {
    const stored = localStorage.getItem('linkshelf-theme');
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    if (event.key === '/' && !typing) {
      event.preventDefault();
      document.getElementById('search')?.focus();
    }
  };
}
