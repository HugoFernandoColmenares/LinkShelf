> **Proyecto:** LinkShelf

# Despliegue y CI/CD

## Entornos

| Entorno    | Web                                         | Firebase                                                                   | Extensión                      |
| ---------- | ------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------ |
| Local      | `pnpm --filter web dev` (localhost:4200)    | **Emulator Suite** (`firebase emulators:start`, proyecto `demo-linkshelf`) | `pnpm --filter extension dev`  |
| CI         | build + e2e                                 | Emuladores dentro del job (`firebase emulators:exec`)                      | artefacto zip                  |
| Preview    | Vercel Preview por PR                       | Proyecto de producción (cada usuario solo ve lo suyo)                      | artefacto zip del CI           |
| Producción | Firebase Hosting (`linkshelf-hugo.web.app`) | Proyecto `linkshelf-hugo` (plan **Spark**)                                 | Carga sin empaquetar / tiendas |

> En Spark se pueden tener varios proyectos gratuitos, pero no hace falta uno de staging: los emuladores cubren desarrollo y CI sin consumir cuota.

## Configuración de Firebase en el repo

`firebase.json`:

```json
{
  "firestore": {
    "rules": "firebase/firestore.rules",
    "indexes": "firebase/firestore.indexes.json"
  },
  "hosting": {
    "public": "apps/web/dist/web/browser",
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

`.firebaserc`: `{ "projects": { "default": "linkshelf-hugo" } }`.

Los tests y `pnpm emulators` usan siempre `--project demo-linkshelf`. Ese id con prefijo `demo-` no puede hablar con el proyecto real. No despliegues reglas con `firebase deploy` hasta revisarlas: el alias `default` apunta a `linkshelf-hugo`.

```bash
pnpm add -D -w firebase-tools
pnpm firebase login                      # una vez, local
pnpm firebase use default
pnpm firebase emulators:start            # Auth + Firestore + UI en :4000
# Hosting (después del build de producción). No publica reglas:
# pnpm firebase deploy --only hosting --project linkshelf-hugo
# Reglas e índices, solo tras revisarlas:
# pnpm firebase deploy --only firestore:rules,firestore:indexes
```

- `firestore.rules` y `firestore.indexes.json` son la **única** fuente de verdad: nada de editar reglas en la consola.
- No hay `functions` en `firebase.json` (requieren Blaze).

## Web en Vercel

- Proyecto con _Root Directory_ `apps/web`, framework _Angular_.
- Build: `pnpm --filter web build` (con `installCommand: pnpm install --frozen-lockfile`).
- Output: `apps/web/dist/web/browser`.
- `vercel.json`: rewrite SPA `/(.*) → /index.html` y headers de seguridad (ver [seguridad.md](seguridad.md)).
- Variables `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` y `FIREBASE_USE_EMULATORS=false` en Vercel (Production y Preview). El build de la web y de la extensión las inyecta; si no hay `FIREBASE_API_KEY`, el bundle queda apuntando a los emuladores.
- Firebase Auth → _Authorized domains_: `linkshelf.vercel.app` (y dominio propio). Firebase no acepta comodines, así que para probar login en previews se añade un **alias fijo de rama** (p. ej. `linkshelf-git-dev-<team>.vercel.app`) o se prueba el login solo en producción y local.
- `authDomain`: usar `<project-id>.firebaseapp.com`. Con navegadores que bloquean cookies de terceros, `signInWithPopup` sigue funcionando; si se migra a `signInWithRedirect`, servir `/__/auth/*` desde el propio dominio con un rewrite de Vercel hacia `https://<project-id>.firebaseapp.com/__/auth/:path*` y usar el dominio de Vercel como `authDomain`.

### Firebase Hosting

Gratis en Spark (10 GB de almacenamiento, 360 MB/día de transferencia). `firebase.json` publica `apps/web/dist/web/browser` con rewrite SPA a `/index.html` y los mismos headers de seguridad que `apps/web/vercel.json`. El workflow `.github/workflows/firebase-hosting.yml` (push a `main` y `workflow_dispatch`) hace el build con `FIREBASE_USE_EMULATORS=false` y despliega **solo Hosting** (`firebase deploy --only hosting --project linkshelf-hugo`). No publica reglas ni índices.

Canales de preview: `firebase hosting:channel:deploy pr-<n>` (Auth autoriza esos dominios automáticamente).

Dominios a confirmar en Firebase Auth → _Authorized domains_ (Firebase suele añadir los del proyecto; hay que comprobarlo):

- `linkshelf-hugo.web.app`
- `linkshelf-hugo.firebaseapp.com`

`authDomain` sigue siendo `linkshelf-hugo.firebaseapp.com`.

## Extensión

- `pnpm --filter extension build` → `.output/chrome-mv3/`; `wxt zip` y `wxt zip -b firefox` generan zips.
- **Uso personal ($0):** `chrome://extensions` → _Modo desarrollador_ → _Cargar descomprimida_. Firefox: firmar como _unlisted_ en AMO (gratis).
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
      - run: pnpm test:rules # firebase emulators:exec --only firestore --project demo-linkshelf
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
      - run: pnpm --filter web e2e # firebase emulators:exec --only auth,firestore "playwright test"
```

Los emuladores con proyecto `demo-*` no necesitan credenciales ni red hacia Firebase.

### `deploy.yml` (todavía no está en el repo)

El workflow de despliegue de reglas e índices queda para después de la revisión. No se incluye ahora para que un merge a `main` no publique `firestore.rules` en `linkshelf-hugo`. Cuando se active, el job será el siguiente (push a `main` con cambios en `firebase/**`):

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

La cuenta de servicio de reglas solo necesita los roles _Firebase Rules Admin_ y _Cloud Datastore Index Admin_. El workflow de Hosting usa el secret `FIREBASE_SERVICE_ACCOUNT` con permiso de Hosting (_Firebase Hosting Admin_). Puede ser la misma cuenta si también tiene ese rol; si no, el deploy de Hosting falla y las reglas siguen sin publicarse. Vercel puede seguir desplegando la web por su integración Git, pero el camino previsto del sitio es Firebase Hosting.

### Sin _keep-alive_

A diferencia de otros free tiers, un proyecto Firebase Spark **no se pausa** por inactividad, así que no hay workflow de ping.

### Respaldo

- La exportación administrada (`gcloud firestore export`) necesita un bucket de Cloud Storage y, por tanto, Blaze: **no** se usa.
- Respaldo manual: botón _Exportar JSON_ en la web (usa el listener en memoria, 0 lecturas extra). Recomendado mensual.
- Opcional `backup.yml` (cron mensual): script Node con `firebase-admin` que lee `users/*/links` (~3 000 lecturas, 6 % de la cuota de un día), cifra el JSON con `age` (clave pública en el repo, privada solo del usuario) y lo sube como artefacto con retención de 90 días. Cifrar es obligatorio porque el repositorio es público. Requiere añadir el rol _Cloud Datastore User_ a una cuenta de servicio distinta.

## Secrets del repositorio

`FIREBASE_SERVICE_ACCOUNT` (JSON de la cuenta de servicio, o ese JSON en base64), `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`. Opcionales: `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID` (el MVP no usa Storage). También, si se sigue usando Vercel: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. La configuración web de Firebase no es un secreto de acceso, pero no se versiona: el build la inyecta desde secrets o desde `.env` local.

Build local equivalente al del workflow (no commitear `.env`):

```bash
export FIREBASE_USE_EMULATORS=false
export FIREBASE_API_KEY=...          # Project settings → Your apps
export FIREBASE_AUTH_DOMAIN=linkshelf-hugo.firebaseapp.com
export FIREBASE_PROJECT_ID=linkshelf-hugo
export FIREBASE_APP_ID=...
export SITE_URL=https://linkshelf-hugo.web.app
pnpm install --frozen-lockfile
pnpm --filter @linkshelf/web build
# Solo Hosting. No incluye firestore:rules ni firestore:indexes.
GOOGLE_APPLICATION_CREDENTIALS=/ruta/sa.json pnpm exec firebase deploy --only hosting --project linkshelf-hugo --non-interactive
```

## Versionado y releases

SemVer por app; tags `web-v1.0.0`, `extension-v1.0.0`; changelog generado desde commits convencionales (ver [convenciones.md](convenciones.md)).
