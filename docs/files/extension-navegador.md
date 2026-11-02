> **Proyecto:** LinkShelf

# Extensión de navegador

Construida con **WXT** (Vite) + TypeScript, Manifest V3. Un solo código genera builds para Chrome, Edge, Brave (Chromium) y Firefox (`wxt build -b firefox`).

## Entrypoints

| Archivo | Rol |
|---|---|
| `entrypoints/background.ts` | Service worker: registra el menú contextual, maneja guardado desde menú, refresca la sesión, muestra notificaciones |
| `entrypoints/popup/` | UI de guardado de la pestaña actual |
| `entrypoints/options/` | Login/logout, categoría por defecto, URL de la web, toggle de importación de favoritos |
| `lib/api.ts` | Cliente Supabase + llamada a `normalize-link` con fallback a `@linkshelf/core` |
| `lib/storage.ts` | Adaptador de almacenamiento de sesión sobre `chrome.storage.local` |

## Permisos (mínimos) y justificación

| Permiso | Por qué | Alternativa descartada |
|---|---|---|
| `activeTab` | Leer URL y título de la pestaña **solo** cuando el usuario abre el popup o usa el menú | `tabs` (acceso a todas las pestañas, más invasivo) |
| `contextMenus` | Entrada *Guardar enlace* / *Guardar esta página* | — |
| `storage` | Guardar la sesión de Supabase y preferencias | `localStorage` no existe en service workers |
| `notifications` | Confirmar guardados desde el menú contextual | Badge del ícono (se usa además) |
| `identity` | Flujo OAuth de GitHub con `launchWebAuthFlow` | Abrir pestaña manual (peor UX) |
| `bookmarks` (**opcional**, `optional_permissions`) | Importar favoritos (Fase 2); se pide en tiempo de ejecución con `chrome.permissions.request` | Pedirlo en la instalación |
| `host_permissions`: `https://<ref>.supabase.co/*` | Llamar a la API y a la Edge Function | `<all_urls>` (innecesario: el fetch de metadatos lo hace la función) |

**No** se usan content scripts ni `<all_urls>`: no se inyecta código en las páginas.

## Popup (UX)

```
┌──────────────────────────────────────┐
│ ⚓ LinkShelf                 ⚙  👤  │
├──────────────────────────────────────┤
│ [og:image miniatura]                 │
│ Título editable ___________________  │
│ example.com/blog/post   🧹 2 params  │
│                                      │
│ ⚠ Posible duplicado (92 %)           │
│   "Cómo construir un agente…"  Ver ↗ │
│                                      │
│ Categoría  [ Tutoriales ▾ ] ✨sugerida│
│ Etiquetas  [ia ×] [typescript ×] [+] │
│ Nota       _______________________   │
│                                      │
│ [ Cancelar ]        [ Guardar igual ]│
└──────────────────────────────────────┘
```

Estados: *cargando* (skeleton, < 3 s), *listo*, *duplicado exacto* (botón principal = *Ver existente*), *posible duplicado*, *guardado* (check + enlace a la web, autocierre 2 s), *error* (reintentar / guardar con datos locales), *sin sesión* (botón *Iniciar sesión*).

Atajo de teclado: `Ctrl+Shift+S` (`commands` → `_execute_action`), `Enter` guarda, `Esc` cierra.

## Menú contextual
- `contexts: ['link']` → **Guardar enlace** (usa `info.linkUrl`, ideal para guardar desde el correo TLDR en Gmail sin abrir el enlace).
- `contexts: ['page']` → **Guardar esta página**.
- Flujo: `normalize-link` → si `exact` notifica "Ya estaba guardado"; si `possible`/`probable` notifica "Posible duplicado — abre el popup para decidir" y **no guarda**; si `none` guarda con la categoría sugerida y notifica con botón *Deshacer* (10 s, hace `delete`).

## Autenticación desde la extensión

Supabase JS funciona en el service worker con un `storage` personalizado:

```ts
createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,  // get/set/remove sobre chrome.storage.local
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
```

### GitHub OAuth (recomendado)
1. `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: chrome.identity.getRedirectURL(), skipBrowserRedirect: true } })` devuelve la URL.
2. `chrome.identity.launchWebAuthFlow({ url, interactive: true })` abre la ventana y devuelve la URL de redirección `https://<extension-id>.chromiumapp.org/?code=...`.
3. `supabase.auth.exchangeCodeForSession(code)`.
4. Añadir `https://<extension-id>.chromiumapp.org/` (y el equivalente de Firefox `https://<uuid>.extensions.allizom.org/`) a *Redirect URLs* en Supabase Auth.

### Magic link
El enlace del email abre la web (`/auth/callback`); la web, si detecta `?ext=1`, envía la sesión a la extensión con `chrome.runtime.sendMessage(EXT_ID, {session})` (declarando `externally_connectable` solo para el dominio de la web). Alternativa más simple: código OTP de 6 dígitos (`signInWithOtp` + `verifyOtp`) escrito en el popup.

### ID estable
Fijar `key` en el manifest de desarrollo para que el `extension-id` (y la redirect URL) no cambie entre instalaciones.

## Importación de favoritos (Fase 2)
- Opción A: `chrome.bookmarks.getTree()` tras permiso opcional; recorrer el árbol, mapear carpeta → categoría por nombre (`Articulos` → `articulos`, etc.), resto → sugerencia por reglas.
- Opción B (web, sin permisos): subir el HTML exportado (formato Netscape) y parsearlo con `DOMParser`.
- Ambas: normalizar en local con `core`, deduplicar dentro del lote, `bulk_check_duplicates`, enviar a `normalize-link` en lotes de 50 para metadatos, crear `import_batches`.

## Cross-browser

| Navegador | Build | Notas |
|---|---|---|
| Chrome / Brave | `wxt build` | Brave usa la misma build y tienda de Chrome |
| Edge | `wxt build -b edge` | Edge Add-ons, publicación gratuita |
| Firefox | `wxt build -b firefox --mv3` | `browser_specific_settings.gecko.id`; service worker → background scripts (WXT lo maneja); `identity.launchWebAuthFlow` soportado |
| Safari | Fuera de alcance | Requiere Xcode y cuenta Apple de pago |

Usar `browser.*` de WXT (polyfill de `webextension-polyfill`) en lugar de `chrome.*` directo.
