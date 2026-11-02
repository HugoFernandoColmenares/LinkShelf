> **Proyecto:** LinkShelf

# Stack y servicios

Restricción principal: **costo $0**. Todo cabe en free tiers.

## Stack elegido

| Capa | Elección | Justificación |
|---|---|---|
| Web | **Angular 22**, standalone components, signals, zoneless, TS strict | Stack principal de Hugo; signals + zoneless dan rendimiento y código simple; standalone elimina NgModules |
| UI | Angular CDK + CSS propio con variables (o Angular Material 3 si se prefiere rapidez) | Ligero, accesible, sin licencias |
| Extensión | **WXT** (Vite) + TS, Manifest V3 | Un solo código para Chrome, Edge, Brave y Firefox; HMR; empaquetado zip por navegador. CRXJS es más acotado a Chrome y con mantenimiento irregular |
| BD | **Supabase Postgres** + `pg_trgm` + `unaccent` | SQL real, índices trigram para dedupe/búsqueda difusa, RLS nativa |
| Auth | **Supabase Auth**: magic link + GitHub OAuth | Gratis, integrado con RLS (`auth.uid()`) |
| Lógica de red | **Supabase Edge Function** `normalize-link` (Deno) | Evita CORS, ejecuta redirecciones y parseo de HTML cerca de la BD |
| Lógica compartida | `@linkshelf/core` en **pnpm workspaces** | Una sola fuente del normalizador y las reglas |
| Hosting web | **Vercel Hobby** | Deploy por push, previews por PR, HTTPS, $0 |
| Tests | **Vitest** (unit), **Playwright** (e2e) | Rápidos, TS nativo; Vitest también es el runner soportado por Angular moderno |
| CI | **GitHub Actions** | Gratis, integra con Vercel y Supabase CLI |
| Lint/format | ESLint (angular-eslint, typescript-eslint) + Prettier | Estándar |

## Límites de free tiers y mitigaciones

| Servicio | Límite relevante (verificar en la web oficial; cambian) | Impacto | Mitigación |
|---|---|---|---|
| Supabase Free | El proyecto se **pausa tras 1 semana sin actividad** | La app deja de responder | Workflow semanal de GitHub Actions que hace un `select` liviano (keep-alive); reactivación manual desde el dashboard si ocurre |
| Supabase Free | **500 MB** de base de datos | ~1 KB/enlace + índices ≈ 3 KB → >100 000 enlaces | No guardar HTML; `og:image` solo como URL; `pg_dump` mensual |
| Supabase Free | 2 proyectos activos máx. | Ninguno | Un proyecto prod; desarrollo con `supabase start` local |
| Supabase Free | Edge Functions: cuota mensual de invocaciones (~500 000) | Muy holgado para un usuario | Debounce en popup; caché por `normalized_url` 24 h en la función; importaciones masivas por lotes de 50 URLs por invocación |
| Supabase Free | 50 000 MAU, emails de Auth con límite por hora del SMTP por defecto | Magic links limitados | Preferir GitHub OAuth; SMTP propio gratuito si hiciera falta |
| Supabase Free | Sin backups automáticos descargables (PITR es de pago) | Riesgo de pérdida | `supabase db dump` programado en Actions como artefacto privado |
| Vercel Hobby | Uso no comercial, 100 GB de ancho de banda | Ninguno | App estática (SPA) |
| GitHub Actions | 2 000 min/mes en privados (ilimitado en públicos) | Ninguno | Caché de pnpm, jobs con `paths` filter |
| Chrome Web Store | Registro de desarrollador USD 5 (pago único) | Rompe $0 | **Opcional**: cargar la extensión "sin empaquetar"; Firefox AMO y Edge Add-ons son gratuitos |

**Costo total mensual: $0.**

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| **Firebase (Firestore + Auth)** | NoSQL sin índices trigram ni `unique` compuesto real; dedupe difuso requeriría servicio externo (Algolia, de pago); Cloud Functions exige plan Blaze con tarjeta |
| **Raindrop.io / Pocket / Linkwarden** (herramientas existentes) | Raindrop: dedupe y funciones avanzadas en plan Pro de pago, sin control de las reglas de TLDR; Pocket fue descontinuado; Linkwarden requiere autohospedaje o pago. Además es un proyecto de portafolio |
| **PocketBase** | Excelente y simple, pero requiere hospedar un servidor (no hay free tier gestionado estable) y SQLite no trae `pg_trgm` |
| **`chrome.storage.sync`** | Cuota ~100 KB y 512 ítems; atado a Chrome; sin consultas |
| **Neon + backend propio** | Más piezas (auth, API) que mantener |
| **CRXJS** | Enfocado en Chrome; WXT cubre Firefox con el mismo código |
| **Netlify / Cloudflare Pages** | Equivalentes válidos; Vercel ya lo usa Hugo y tiene buen soporte Angular |

## Servicios a configurar
1. Proyecto Supabase `linkshelf` (región más cercana: `us-east-1` o `sa-east-1`).
2. OAuth App de GitHub (callback `https://<ref>.supabase.co/auth/v1/callback`).
3. Proyecto Vercel apuntando a `apps/web`.
4. Repositorio GitHub con secrets (ver [despliegue-y-ci.md](despliegue-y-ci.md)).
5. (Fase 3) Proyecto Google Cloud con Gmail API, scope `gmail.readonly`.
