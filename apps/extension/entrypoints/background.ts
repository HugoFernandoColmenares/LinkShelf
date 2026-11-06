import { browser } from 'wxt/browser';
import { PRIVATE_INSTANCE_MESSAGE, personalUser } from '../lib/access';
import { commitLink, inspectLink, removeLink } from '../lib/save';
import { auth } from '../lib/firebase';

const pendingUndo = new Map<string, string>();

async function notify(id: string, message: string, undoLinkId?: string): Promise<void> {
  await browser.notifications.create(id, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png' as '/popup.html'),
    title: 'LinkShelf',
    message,
    ...(undoLinkId ? { buttons: [{ title: 'Deshacer' }] } : {}),
  });
  if (undoLinkId) {
    pendingUndo.set(id, undoLinkId);
    setTimeout(() => pendingUndo.delete(id), 10_000);
  }
}

async function saveFromMenu(url: string, title?: string): Promise<void> {
  if (!auth.currentUser) {
    await notify(`auth-${Date.now()}`, 'Inicia sesión en LinkShelf para guardar.');
    return;
  }
  if (!personalUser()) {
    await notify(`private-${Date.now()}`, PRIVATE_INSTANCE_MESSAGE);
    return;
  }
  try {
    const inspection = await inspectLink({ url, ...(title ? { title } : {}) });
    if (inspection.duplicate.level === 'exact') {
      await notify(`exact-${inspection.prepared.id}`, 'Ya estaba guardado');
      return;
    }
    if (inspection.duplicate.level === 'possible' || inspection.duplicate.level === 'probable') {
      await notify(`near-${Date.now()}`, 'Posible duplicado — abre el popup para decidir');
      return;
    }
    await commitLink(inspection.prepared, {
      category: inspection.prepared.suggestion.category,
      tags: inspection.prepared.suggestion.tags,
    });
    await notify(`saved-${inspection.prepared.id}`, 'Enlace guardado', inspection.prepared.id);
  } catch {
    await notify(`err-${Date.now()}`, 'No se pudo guardar el enlace.');
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void (async () => {
      await browser.contextMenus.removeAll();
      await browser.contextMenus.create({
        id: 'save-link',
        title: 'Guardar enlace',
        contexts: ['link'],
      });
      await browser.contextMenus.create({
        id: 'save-page',
        title: 'Guardar esta página',
        contexts: ['page'],
      });
    })();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-link' && info.linkUrl) {
      void saveFromMenu(info.linkUrl);
      return;
    }
    if (info.menuItemId === 'save-page' && tab?.url) {
      void saveFromMenu(tab.url, tab.title);
    }
  });

  browser.notifications.onButtonClicked.addListener((notificationId) => {
    const linkId = pendingUndo.get(notificationId);
    if (!linkId) return;
    pendingUndo.delete(notificationId);
    void removeLink(linkId);
  });

  browser.alarms.create('pending-meta', { periodInMinutes: 360 });
  browser.alarms.onAlarm.addListener(() => {
    // Completar metadatos pendientes queda para la siguiente iteración.
  });
});
