> **Proyecto:** LinkShelf

# Roadmap

## Fase 0 — Documentación y scaffolding

- [x] Documentación inicial (`docs/files`)
- [x] Monorepo pnpm (`apps/web`, `apps/extension`, `packages/core`, `packages/firebase`, `firebase/`)
- [x] ESLint + Prettier + TS strict + `tsconfig.base.json`
- [x] CI básico (lint, typecheck, test, build)

## Fase 1 — MVP

### Core

- [x] `normalizeUrl` con todos los pasos y reglas por dominio
- [x] Lista de parámetros de tracking + desenvolvedor de redirecciones TLDR
- [x] `linkIdFor` (SHA-256 hex), `buildKeywords`, `titleSimilarity` (trigramas + Jaccard)
- [x] `resolveRedirects` + `extractMetadata` (para la extensión)
- [x] Configuración fija de categorías y motor de reglas
- [x] Tests con cobertura ≥ 90 %

### Firebase (plan Spark)

- [x] Proyecto `linkshelf-hugo` (Spark, Firestore Standard en `nam5`, Auth con Google). Las reglas no se despliegan desde este repo hasta después de la revisión
- [x] `firestore.rules` + `firestore.indexes.json` + `firebase.json` con emuladores (`demo-linkshelf`)
- [x] Tests de reglas con `@firebase/rules-unit-testing`
- [x] `@linkshelf/firebase`: convertidores tipados y `LinksRepo` (transacción de creación)
- [ ] Restringir API keys; App Check opcional

### Web

- [x] Login con Google (`signInWithPopup`). Con emuladores hay además un acceso local. La caché persistente se usa fuera de los emuladores
- [x] Biblioteca con sidebar, filtros en query params y paginación de 30 en 30
- [x] Guardar enlace con aviso de duplicado (metadatos `pending` si no hay extensión) y _Guardar igual_
- [x] Detalle/edición y eliminación
- [ ] Gestión de etiquetas (renombrar, fusionar o borrar en lote). En el MVP se editan por enlace
- [x] Tema claro/oscuro y base de accesibilidad (foco, `lang="es-419"`, alerta de duplicado)
- [ ] Deploy en Vercel (`vercel.json` listo; no se despliega en este hito)

### Extensión

- [x] Popup con sugerencia, categoría y aviso de duplicado
- [x] Menú contextual _Guardar enlace_ / _Guardar esta página_ con notificación y _Deshacer_
- [x] Login con Google (`launchWebAuthFlow` + `signInWithCredential`, build `firebase/auth/web-extension`) y acceso local si hay emuladores
- [ ] Permiso de host opcional ya se puede pedir; la alarma de metadatos pendientes todavía no los completa
- [x] Build Chrome MV3 (`wxt build`). Firefox añade `browser_specific_settings` con `-b firefox`

### Operación

- [ ] Workflow de despliegue de reglas e índices
- [ ] Exportación JSON y backup cifrado opcional
- [ ] Revisión mensual del consumo en la consola (cuotas Spark)

## Fase 2 — Importar favoritos

- [x] Parser de HTML de favoritos (Netscape) y pantalla web para mapear carpetas
- [x] Importación vía `bookmarks` opcional en la extensión (permiso en tiempo de ejecución)
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
