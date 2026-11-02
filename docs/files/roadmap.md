> **Proyecto:** LinkShelf

# Roadmap

## Fase 0 — Documentación y scaffolding
- [x] Documentación inicial (`docs/files`)
- [ ] Crear repositorio en GitHub
- [ ] Monorepo pnpm (`apps/web`, `apps/extension`, `packages/core`, `packages/firebase`, `firebase/`)
- [ ] ESLint + Prettier + TS strict + `tsconfig.base.json`
- [ ] CI básico (lint, test, build)

## Fase 1 — MVP
### Core
- [ ] `normalizeUrl` con todos los pasos y reglas por dominio
- [ ] Lista de parámetros de tracking + desenvolvedor de redirecciones TLDR
- [ ] `linkIdFor` (SHA-256 hex), `buildKeywords`, `titleSimilarity` (trigramas + Jaccard)
- [ ] `resolveRedirects` + `extractMetadata` (para la extensión)
- [ ] Configuración fija de categorías y motor de reglas
- [ ] Tests con cobertura ≥ 90 %
### Firebase (plan Spark)
- [ ] Crear proyecto sin facturación; Firestore Standard (`southamerica-east1` o `nam5`); Auth con Google
- [ ] `firestore.rules` + `firestore.indexes.json` + `firebase.json` con emuladores
- [ ] Tests de reglas con `@firebase/rules-unit-testing`
- [ ] `@linkshelf/firebase`: convertidores tipados y `LinksRepo` (transacción de creación)
- [ ] Restringir API keys; App Check opcional
### Web
- [ ] Login con Google (`signInWithPopup`) y persistencia offline
- [ ] Biblioteca con sidebar, filtros en query params, scroll infinito
- [ ] Guardar enlace con aviso de duplicado (metadatos `pending` si no hay extensión)
- [ ] Detalle/edición y eliminación
- [ ] Gestión de etiquetas
- [ ] Tema claro/oscuro, accesibilidad AA
- [ ] Deploy en Vercel
### Extensión
- [ ] Popup con sugerencia y aviso de duplicado
- [ ] Menú contextual *Guardar enlace* / *Guardar esta página* con notificación y *Deshacer*
- [ ] Login con Google (`launchWebAuthFlow` + `signInWithCredential`, build `firebase/auth/web-extension`)
- [ ] Permiso de host opcional para resolver redirecciones; alarma que completa metadatos pendientes
- [ ] Builds Chrome/Edge/Firefox
### Operación
- [ ] Workflow de despliegue de reglas e índices
- [ ] Exportación JSON y backup cifrado opcional
- [ ] Revisión mensual del consumo en la consola (cuotas Spark)

## Fase 2 — Importar favoritos
- [ ] Parser de HTML de favoritos (Netscape)
- [ ] Importación vía `chrome.bookmarks` (permiso opcional)
- [ ] Mapeo carpeta → categoría
- [ ] Dedupe masivo (mismo ID en el lote + existentes + similitud) con informe; `writeBatch` de 500
- [ ] `users/{uid}/importBatches` con reversión
- [ ] Migración de IDs cuando cambia `normalizerVersion`
- [ ] Pantalla `/duplicates` para fusionar existentes

## Fase 3 — Gmail TLDR y estado de lectura
- [ ] OAuth Google `gmail.readonly` y búsqueda `from:dan@tldrnewsletter.com`
- [ ] Extracción de enlaces por sección del newsletter (sugerir categoría por sección: "AI" → `ia`, "Design" → `diseno`)
- [ ] Leído/no leído, favoritos, filtros de estado
- [ ] Reglas personales por dominio (`users/{uid}/domainRules`) aprendidas de correcciones

## Fase 4 — Búsqueda y sugerencias avanzadas
- [ ] Búsqueda local avanzada (MiniSearch sobre el listener en memoria; `keywords` para consultas remotas)
- [ ] Sugerencia por LLM gratuito desde la extensión con clave del usuario (opcional, con fallback)
- [ ] Hash de contenido para duplicados
- [ ] Exportar JSON / HTML de favoritos
- [ ] PWA instalable
