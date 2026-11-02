> **Proyecto:** LinkShelf

# Despliegue y CI/CD

## Entornos
| Entorno | Web | Firebase | Extensión |
|---|---|---|---|
| Local | `pnpm --filter web dev` (localhost:4200) | **Emulator Suite** (`firebase emulators:start`, proyecto `demo-linkshelf`) | `pnpm --filter extension dev` |
| CI | build + e2e | Emuladores dentro del job (`firebase emulators:exec`) | artefacto zip |
| Preview | Vercel Preview por PR | Proyecto de producción (cada usuario solo ve lo suyo) | artefacto zip del CI |
| Producción | Vercel Production (`main`) | Proyecto `linkshelf` (plan **Spark**) | Carga sin empaquetar / tiendas |

> En Spark se pueden tener varios proyectos gratuitos, pero no hace falta uno de staging: los emuladores cubren desarrollo y CI sin consumir cuota.

## Configuración de Firebase en el repo

`firebase.json`:
```json
{
  "firestore": { "rules": "firebase/firestore.rules", "indexes": "firebase/firestore.indexes.json" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

`.firebaserc`: `{ "projects": { "default": "linkshelf-<sufijo>" } }`.

```bash
pnpm add -D -w firebase-tools
pnpm firebase login                      # una vez, local
pnpm firebase use default
pnpm firebase emulators:start            # Auth + Firestore + UI en :4000
pnpm firebase deploy --only firestore:rules,firestore:indexes
```
- `firestore.rules` y `firestore.indexes.json` son la **única** fuente de verdad: nada de editar reglas en la consola.
- No hay `functions` en `firebase.json` (requieren Blaze).

## Web en Vercel
- Proyecto con *Root Directory* `apps/web`, framework *Angular*.
- Build: `pnpm --filter web build` (con `installCommand: pnpm install --frozen-lockfile`).
- Output: `apps/web/dist/web/browser`.
- `vercel.json`: rewrite SPA `/(.*) → /index.html` y headers de seguridad (ver [seguridad.md](seguridad.md)).
- Variables `NG_APP_FIREBASE_*` y `NG_APP_SITE_URL` en Vercel (Production y Preview).
- Firebase Auth → *Authorized domains*: `linkshelf.vercel.app` (y dominio propio). Firebase no acepta comodines, así que para probar login en previews se añade un **alias fijo de rama** (p. ej. `linkshelf-git-dev-<team>.vercel.app`) o se prueba el login solo en producción y local.
- `authDomain`: usar `<project-id>.firebaseapp.com`. Con navegadores que bloquean cookies de terceros, `signInWithPopup` sigue funcionando; si se migra a `signInWithRedirect`, servir `/__/auth/*` desde el propio dominio con un rewrite de Vercel hacia `https://<project-id>.firebaseapp.com/__/auth/:path*` y usar el dominio de Vercel como `authDomain`.

### Alternativa: Firebase Hosting
Gratis en Spark (10 GB de almacenamiento, 360 MB/día de transferencia). `firebase init hosting` con `public: apps/web/dist/web/browser` y rewrite SPA; canales de preview con `firebase hosting:channel:deploy pr-<n>` (dominios de preview autorizados automáticamente en Auth). Se mantiene Vercel por su integración Git, pero el cambio es directo si se prefiere todo en Firebase.

## Extensión
- `pnpm --filter extension build` → `.output/chrome-mv3/`; `wxt zip` y `wxt zip -b firefox` generan zips.
- **Uso personal ($0):** `chrome://extensions` → *Modo desarrollador* → *Cargar descomprimida*. Firefox: firmar como *unlisted* en AMO (gratis).
- **Opcional:** Chrome Web Store (USD 5 único), Edge Add-ons (gratis), Firefox AMO (gratis). Publicación con `wxt submit`.
- Fijar `key` en el manifest para que el ID (y la redirect URI `https://<id>.chromiumapp.org/` registrada en Google Cloud) no cambie.
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
  rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 21 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:rules          # firebase emulators:exec --only firestore --project demo-linkshelf
  e2e:
    needs: [quality, rules]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 21 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm --filter web e2e    # firebase emulators:exec --only auth,firestore "playwright test"
```
Los emuladores con proyecto `demo-*` no necesitan credenciales ni red hacia Firebase.

### `deploy.yml` (push a `main` con cambios en `firebase/**`)
```yaml
name: Deploy Firestore
on:
  push:
    branches: [main]
    paths: ['firebase/**', 'firebase.json']
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: echo '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}' > "$RUNNER_TEMP/sa.json"
      - run: pnpm firebase deploy --only firestore:rules,firestore:indexes --non-interactive
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ runner.temp }}/sa.json
```
La cuenta de servicio solo tiene los roles *Firebase Rules Admin* y *Cloud Datastore Index Admin*. Vercel despliega la web por su integración Git (o `vercel deploy --prod` con `VERCEL_TOKEN`).

### Sin *keep-alive*
A diferencia de otros free tiers, un proyecto Firebase Spark **no se pausa** por inactividad, así que no hay workflow de ping.

### Respaldo
- La exportación administrada (`gcloud firestore export`) necesita un bucket de Cloud Storage y, por tanto, Blaze: **no** se usa.
- Respaldo manual: botón *Exportar JSON* en la web (usa el listener en memoria, 0 lecturas extra). Recomendado mensual.
- Opcional `backup.yml` (cron mensual): script Node con `firebase-admin` que lee `users/*/links` (~3 000 lecturas, 6 % de la cuota de un día), cifra el JSON con `age` (clave pública en el repo, privada solo del usuario) y lo sube como artefacto con retención de 90 días. Cifrar es obligatorio porque el repositorio es público. Requiere añadir el rol *Cloud Datastore User* a una cuenta de servicio distinta.

## Secrets del repositorio
`FIREBASE_SERVICE_ACCOUNT` (deploy de reglas/índices), `BACKUP_SERVICE_ACCOUNT` (opcional), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (y de tiendas si se publica). La configuración web de Firebase no es secreta, pero se pasa como variables de Vercel para no duplicarla.

## Versionado y releases
SemVer por app; tags `web-v1.0.0`, `extension-v1.0.0`; changelog generado desde commits convencionales (ver [convenciones.md](convenciones.md)).
