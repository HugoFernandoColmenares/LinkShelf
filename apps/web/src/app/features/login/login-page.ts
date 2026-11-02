import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { authErrorMessage } from '../../core/format';

@Component({
  selector: 'ls-login-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly useEmulators = this.auth.useEmulators;
  readonly email = signal('prueba@linkshelf.dev');
  readonly password = signal('');
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  async google(): Promise<void> {
    await this.run(() => this.auth.signInGoogle());
  }

  async local(event: Event): Promise<void> {
    event.preventDefault();
    await this.run(() => this.auth.signInLocal(this.email(), this.password()));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await action();
      await this.router.navigate(['/links']);
    } catch (error) {
      this.error.set(authErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
