import { browser } from 'wxt/browser';
import '../popup/style.css';
import {
  signInLocal,
  signInWithGoogle,
  signOutUser,
  useEmulators,
  watchUser,
} from '../../lib/firebase';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

const root = document.querySelector('#app');
if (!root) throw new Error('Falta el contenedor');
const app: Element = root;

function render(email: string | null, message = ''): void {
  app.innerHTML = `
    <h1>⚓ LinkShelf</h1>
    <p>${email ? `Sesión: ${escapeHtml(email)}` : 'Sin sesión'}</p>
    ${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ''}
    ${email ? '<button id="out" type="button">Cerrar sesión</button>' : '<button id="google" class="primary" type="button">Continuar con Google</button>'}
    ${
      useEmulators
        ? `<form id="local"><p class="hint">Modo emulador.</p><label>Correo<input name="email" type="email" required /></label><label>Contraseña<input name="password" type="password" minlength="6" required /></label><button type="submit">Entrar en local</button></form>`
        : ''
    }
    <p><button id="hosts" type="button">Permitir leer metadatos de las páginas</button></p>`;
  document.querySelector('#out')?.addEventListener('click', () => void signOutUser());
  document.querySelector('#google')?.addEventListener('click', () => {
    void signInWithGoogle().catch((error: unknown) =>
      render(email, error instanceof Error ? error.message : 'No se pudo entrar'),
    );
  });
  document.querySelector('#local')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    void signInLocal(String(data.get('email') ?? ''), String(data.get('password') ?? '')).catch(
      (error: unknown) =>
        render(email, error instanceof Error ? error.message : 'No se pudo entrar'),
    );
  });
  document.querySelector('#hosts')?.addEventListener('click', () => {
    void browser.permissions.request({ origins: ['https://*/*', 'http://*/*'] });
  });
}

watchUser((user) => render(user?.email ?? null));
