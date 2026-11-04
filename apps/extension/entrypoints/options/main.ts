import { browser } from 'wxt/browser';
import '../popup/style.css';
import {
  CATEGORIES,
  draftBookmarkImport,
  flattenBookmarkNodes,
  isCategorySlug,
  prepareLink,
  type BookmarkDraft,
  type CategorySlug,
} from '@linkshelf/core';
import { LinksRepo } from '@linkshelf/firebase';
import {
  auth,
  db,
  signInLocal,
  signInWithGoogle,
  signOutUser,
  siteUrl,
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
    <p><button id="hosts" type="button">Permitir leer metadatos de las páginas</button></p>
    <p><button id="bookmarks" type="button">Importar favoritos de este navegador</button></p>
    <p class="hint">Chrome, Edge y Brave los llaman favoritos. Firefox, marcadores. También puedes subir el HTML en <a href="${siteUrl}/import" target="_blank" rel="noreferrer">Importar</a>.</p>`;
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
  document.querySelector('#bookmarks')?.addEventListener('click', () => {
    void importBrowserBookmarks(email).catch((error: unknown) =>
      render(email, error instanceof Error ? error.message : 'No se pudieron leer los favoritos'),
    );
  });
}

async function importBrowserBookmarks(email: string | null): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    render(email, 'Inicia sesión en la extensión antes de importar.');
    return;
  }
  const granted = await browser.permissions.request({ permissions: ['bookmarks'] });
  if (!granted) throw new Error('Permiso de favoritos rechazado');
  const tree = await browser.bookmarks.getTree();
  const parsed = flattenBookmarkNodes(tree);
  const repo = new LinksRepo(db);
  const existing = await repo.listAll(user.uid);
  const drafts = await draftBookmarkImport(
    parsed,
    existing.map((link) => ({
      id: link.id,
      title: link.title,
      normalizedUrl: link.normalizedUrl,
      domain: link.domain,
      category: link.category,
      canonicalUrl: link.canonicalUrl,
      createdAt: link.createdAt,
    })),
  );
  const folders = [...new Set(drafts.map((item) => item.folderKey))];
  const rows = folders
    .map((folder) => {
      const suggested =
        drafts.find((item) => item.folderKey === folder)?.suggestedCategory ?? 'webpages';
      return `<label>${escapeHtml(folder)}<select data-folder="${escapeHtml(folder)}">${CATEGORIES.map(
        (category) =>
          `<option value="${category.slug}" ${category.slug === suggested ? 'selected' : ''}>${category.name}</option>`,
      ).join('')}</select></label>`;
    })
    .join('');
  const host = document.createElement('section');
  host.innerHTML = `<h2>Carpetas de favoritos</h2><p>${drafts.length} enlaces. Elige la categoría de cada carpeta. Los duplicados exactos no se vuelven a guardar.</p>${rows}<button id="confirm-import" class="primary" type="button">Importar nuevos</button>`;
  app.append(host);
  host.querySelector('#confirm-import')?.addEventListener('click', () => {
    const mapping = new Map<string, CategorySlug>();
    host.querySelectorAll('select').forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      const folder = select.getAttribute('data-folder') ?? '';
      if (isCategorySlug(select.value)) mapping.set(folder, select.value);
    });
    void saveImportedBookmarks(user.uid, drafts, mapping, email);
  });
}

async function saveImportedBookmarks(
  uid: string,
  drafts: BookmarkDraft[],
  mapping: Map<string, CategorySlug>,
  email: string | null,
): Promise<void> {
  const fresh = drafts.filter((item) => item.status === 'new');
  const items = [];
  for (const draft of fresh) {
    const prepared = await prepareLink({ url: draft.url, title: draft.title, source: 'import' });
    items.push({ prepared, category: mapping.get(draft.folderKey) ?? draft.suggestedCategory });
  }
  const created = await new LinksRepo(db).importMany(
    uid,
    {
      id: crypto.randomUUID(),
      source: 'bookmarks',
      total: drafts.length,
      duplicates: drafts.filter((item) => item.status === 'exact').length,
      failed: drafts.filter((item) => item.status === 'invalid').length,
    },
    items,
  );
  render(
    email,
    `Importados ${created} favoritos. Los duplicados exactos no se volvieron a guardar.`,
  );
}

watchUser((user) => render(user?.email ?? null));
