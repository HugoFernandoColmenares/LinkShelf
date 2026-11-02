import { browser } from 'wxt/browser';
import { CATEGORIES, type CategorySlug } from '@linkshelf/core';
import type { DuplicateCheck, PreparedLink } from '@linkshelf/core';
import { siteUrl } from '../../lib/firebase';
import { commitLink, inspectLink } from '../../lib/save';

const root = document.querySelector('#app');
if (!root) throw new Error('Falta el contenedor');
const app: Element = root;

const preview = new URLSearchParams(location.search).has('preview');

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

function render(state: {
  title: string;
  normalizedUrl: string;
  category: CategorySlug;
  duplicate: DuplicateCheck;
  signedIn: boolean;
  message?: string;
  saved?: boolean;
  prepared?: PreparedLink;
}): void {
  const options = CATEGORIES.map(
    (category) =>
      `<option value="${category.slug}" ${category.slug === state.category ? 'selected' : ''}>${category.name}</option>`,
  ).join('');
  const duplicate =
    state.duplicate.level === 'none'
      ? ''
      : `<div class="alert" role="alert"><strong>${state.duplicate.level === 'exact' ? 'Ya guardaste este enlace' : 'Posible duplicado'}</strong><div>${state.duplicate.matches
          .slice(0, 3)
          .map(
            (match) =>
              `<div>${escapeHtml(match.title)} <span>${Math.round(match.score * 100)} %</span></div>`,
          )
          .join('')}</div></div>`;
  const action =
    state.duplicate.level === 'exact'
      ? `<a href="${siteUrl}/links/${state.duplicate.matches[0]?.id ?? ''}" target="_blank" rel="noreferrer">Ver existente</a>`
      : `<button class="primary" id="save" type="button">${state.duplicate.level === 'none' ? 'Guardar' : 'Guardar igual'}</button>`;
  app.innerHTML = `
    <header><h1>⚓ LinkShelf</h1><a href="${siteUrl}" target="_blank" rel="noreferrer">Web</a></header>
    <main>
      <p class="mono">${escapeHtml(state.normalizedUrl)}</p>
      ${duplicate}
      ${state.message ? `<p class="error" role="alert">${escapeHtml(state.message)}</p>` : ''}
      ${state.saved ? '<p role="status">Enlace guardado.</p>' : ''}
      <label>Título<input id="title" value="${escapeHtml(state.title)}" /></label>
      <label>Categoría<select id="category">${options}</select></label>
      <div class="row"><button type="button" id="close">Cancelar</button>${state.signedIn ? action : '<button id="login" type="button">Iniciar sesión</button>'}</div>
    </main>`;
  document.querySelector('#close')?.addEventListener('click', () => window.close());
  document
    .querySelector('#login')
    ?.addEventListener('click', () => void browser.runtime.openOptionsPage());
  document.querySelector('#save')?.addEventListener('click', () => {
    const prepared = state.prepared;
    if (!prepared) return;
    const title =
      (document.querySelector('#title') as HTMLInputElement | null)?.value.trim() || prepared.title;
    const category = ((document.querySelector('#category') as HTMLSelectElement | null)?.value ||
      state.category) as CategorySlug;
    void commitLink({ ...prepared, title }, { category, tags: prepared.suggestion.tags })
      .then(() => {
        render({ ...state, saved: true, title, category });
        setTimeout(() => window.close(), 1200);
      })
      .catch((error: unknown) => {
        render({
          ...state,
          message: error instanceof Error ? error.message : 'No se pudo guardar',
        });
      });
  });
}

async function boot(): Promise<void> {
  if (preview) {
    render({
      title: 'Cómo construir un agente con TypeScript',
      normalizedUrl: 'https://blog.example.com/agentes',
      category: 'tutoriales',
      signedIn: true,
      duplicate: {
        level: 'probable',
        matches: [
          {
            id: 'demo',
            title: 'Cómo construir un agente…',
            domain: 'blog.example.com',
            category: 'tutoriales',
            createdAt: null,
            score: 0.92,
            reason: 'similar-title',
          },
        ],
      },
    });
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    app.innerHTML = '<main><p>Abre una página http(s) para guardarla.</p></main>';
    return;
  }
  try {
    const inspection = await inspectLink({ url, ...(tab?.title ? { title: tab.title } : {}) });
    render({
      title: inspection.prepared.title,
      normalizedUrl: inspection.prepared.normalizedUrl,
      category: inspection.prepared.suggestion.category,
      duplicate: inspection.duplicate,
      signedIn: inspection.signedIn,
      prepared: inspection.prepared,
    });
  } catch (error) {
    app.innerHTML = `<main><p class="error">${escapeHtml(error instanceof Error ? error.message : 'No se pudo preparar el enlace')}</p></main>`;
  }
}

void boot();
