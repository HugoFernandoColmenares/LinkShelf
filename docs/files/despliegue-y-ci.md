> **Proyecto:** LinkShelf

# Despliegue y CI/CD

## Entornos
| Entorno | Web | Supabase | Extensión |
|---|---|---|---|
| Local | `pnpm --filter web dev` (localhost:4200) | `supabase start` (Docker) | `pnpm --filter extension dev` |
| Preview | Vercel Preview por PR | Proyecto prod (solo lectura de datos propios) o local | artefacto zip del CI |
| Producción | Vercel Production (`main`) | Proyecto `linkshelf` (Free) | Carga sin empaquetar / tiendas |

> El free tier permite 2 proyectos: se usa uno para producción; las pruebas van contra Supabase local.

## Web en Vercel
- Proyecto con *Root Directory* `apps/web`, framework *Angular*.
- Build: `pnpm --filter web build` (desde la raíz con `installCommand: pnpm install --frozen-lockfile`).
- Output: `apps/web/dist/web/browser`.
- `vercel.json`: rewrite SPA `/(.*) → /index.html` y headers de seguridad (ver [seguridad.md](seguridad.md)).
- Variables `NG_APP_SUPABASE_URL`, `NG_APP_SUPABASE_ANON_KEY`, `NG_APP_SITE_URL` en Vercel (Production y Preview).
- Integración Git de Vercel para previews automáticas; alternativamente `vercel deploy --prebuilt` desde Actions.
- Añadir la URL de producción y `https://*-<team>.vercel.app` a *Redirect URLs* de Supabase Auth.

## Supabase
```bash
supabase init
supabase link --project-ref $SUPABASE_PROJECT_REF
supabase migration new init          # crea supabase/migrations/<timestamp>_init.sql
supabase db reset                    # local: aplica migraciones + seed
supabase db push                     # remoto (desde CI en main)
supabase functions deploy normalize-link
supabase secrets set NORMALIZE_USER_AGENT="LinkShelf/1.0"
supabase gen types typescript --local > packages/core/src/database.types.ts
```
- Las migraciones son la única forma de cambiar el esquema (nada de cambios manuales en el dashboard).
- Tipos generados se versionan y el CI verifica que estén al día (`git diff --exit-code`).

## Extensión
- `pnpm --filter extension build` → `.output/chrome-mv3/`; `wxt zip` y `wxt zip -b firefox` generan zips.
- **Uso personal ($0):** `chrome://extensions` → *Modo desarrollador* → *Cargar descomprimida*. Firefox: firmar como *unlisted* en AMO (gratis).
- **Opcional:** Chrome Web Store (USD 5 único), Edge Add-ons (gratis), Firefox AMO (gratis). Publicación con `wxt submit` y secrets de cada tienda.
- Versionado: `version` del manifest sincronizada con `apps/extension/package.json`.

## GitHub Actions

### `.github/workflows/ci.yml` (PR y push)
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:coverage
      - run: pnpm --filter web build
      - run: pnpm --filter extension build && pnpm --filter extension zip
      - uses: actions/upload-artifact@v4
        with: { name: extension, path: apps/extension/.output/*.zip }
  db:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start -x studio,imgproxy
      - run: supabase test db
  e2e:
    needs: [quality, db]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: supabase/setup-cli@v1
      - run: pnpm install --frozen-lockfile
      - run: supabase start -x studio,imgproxy && supabase functions serve &
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm --filter web e2e
```

### `deploy.yml` (push a `main`)
1. `supabase db push` y `supabase functions deploy normalize-link` (secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`).
2. Vercel despliega por integración Git (o `vercel deploy --prod` con `VERCEL_TOKEN`).

### `keep-alive.yml` (cron semanal)
Evita la pausa por inactividad del free tier:
```yaml
on:
  schedule: [{ cron: '0 14 * * 1' }]   # lunes 09:00 hora Bogotá
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: >
          curl -fsS "$SUPABASE_URL/rest/v1/categories?select=slug&limit=1"
          -H "apikey: $SUPABASE_ANON_KEY"
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```
> Requiere una política de lectura de `categories` para `anon` o usar un endpoint de salud; alternativa: llamar a la Edge Function con un JWT de un usuario técnico.

### `backup.yml` (cron mensual)
`supabase db dump --data-only` → artefacto privado (retención 90 días).

## Secrets del repositorio
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (y de tiendas si se publica).

## Versionado y releases
SemVer por app; tags `web-v1.0.0`, `extension-v1.0.0`; changelog generado desde commits convencionales (ver [convenciones.md](convenciones.md)).
