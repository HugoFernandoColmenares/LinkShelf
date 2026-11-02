> **Proyecto:** LinkShelf

# Roadmap

## Fase 0 — Documentación y scaffolding
- [x] Documentación inicial (`docs/files`)
- [ ] Crear repositorio en GitHub
- [ ] Monorepo pnpm (`apps/web`, `apps/extension`, `packages/core`, `supabase/`)
- [ ] ESLint + Prettier + TS strict + `tsconfig.base.json`
- [ ] CI básico (lint, test, build)

## Fase 1 — MVP
### Core
- [ ] `normalizeUrl` con todos los pasos y reglas por dominio
- [ ] Lista de parámetros de tracking + desenvolvedor de redirecciones TLDR
- [ ] Motor de reglas de categorías
- [ ] Tests con cobertura ≥ 90 %
### Supabase
- [ ] Migración inicial: tablas, índices, triggers, RLS, seed de categorías
- [ ] RPCs `find_duplicates`, `save_link`, `search_links`
- [ ] Tests pgTAP de RLS
- [ ] Edge Function `normalize-link` (redirecciones, metadatos, SSRF, CORS, rate limit)
- [ ] Auth: magic link/OTP + GitHub OAuth
### Web
- [ ] Login y callback
- [ ] Biblioteca con sidebar, filtros en query params, scroll infinito
- [ ] Guardar enlace con aviso de duplicado
- [ ] Detalle/edición y eliminación
- [ ] Gestión de etiquetas
- [ ] Tema claro/oscuro, accesibilidad AA
- [ ] Deploy en Vercel
### Extensión
- [ ] Popup con sugerencia y aviso de duplicado
- [ ] Menú contextual *Guardar enlace* / *Guardar esta página* con notificación y *Deshacer*
- [ ] Login con GitHub (`launchWebAuthFlow`) y OTP
- [ ] Builds Chrome/Edge/Firefox
### Operación
- [ ] Workflow keep-alive y backup

## Fase 2 — Importar favoritos
- [ ] Parser de HTML de favoritos (Netscape)
- [ ] Importación vía `chrome.bookmarks` (permiso opcional)
- [ ] Mapeo carpeta → categoría
- [ ] Dedupe masivo (en lote + contra BD) con informe
- [ ] `import_batches` con reversión
- [ ] Pantalla `/duplicates` para fusionar existentes

## Fase 3 — Gmail TLDR y estado de lectura
- [ ] OAuth Google `gmail.readonly` y búsqueda `from:dan@tldrnewsletter.com`
- [ ] Extracción de enlaces por sección del newsletter (sugerir categoría por sección: "AI" → `ia`, "Design" → `diseno`)
- [ ] Leído/no leído, favoritos, filtros de estado
- [ ] Reglas personales por dominio aprendidas de correcciones

## Fase 4 — Búsqueda y sugerencias avanzadas
- [ ] Full-text (`tsvector` generado + índice GIN)
- [ ] Sugerencia por LLM gratuito (opcional, con fallback)
- [ ] Hash de contenido para duplicados
- [ ] Exportar JSON / HTML de favoritos
- [ ] PWA instalable
