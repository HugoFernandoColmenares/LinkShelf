<!-- Nombre del proyecto: cambiarlo aquí y en la primera línea de cada doc -->

> **Proyecto:** LinkShelf

# LinkShelf

Gestor personal de enlaces con base de datos en la nube y extensión de navegador. Guarda, limpia, deduplica y categoriza los artículos que encuentras (por ejemplo, en el newsletter **TLDR**) sin depender de los favoritos de un navegador concreto.

## El problema

Los favoritos del navegador crecieron sin control: cientos de enlaces de TLDR, muchos **duplicados** (misma URL con distintos `utm_*`, con o sin `www`, con o sin `/` final, o envueltos en redirecciones de tracking del newsletter), mezclados en carpetas poco consistentes y atados a un solo navegador.

## La solución

- **Dos modos de guardado**, detrás de la misma interfaz `LinkRepository`: el modo demo (por defecto) escribe en el navegador y el modo personal escribe en Cloud Firestore.
- **Extensión de navegador** (Chrome, Edge, Brave, Firefox) para guardar la pestaña actual en un clic o desde el menú contextual _Guardar enlace_. En el modo personal sigue usando Firestore.
- **Web app** (Angular) para buscar, filtrar, editar y limpiar la colección.
- **Normalización y deduplicación inteligente, 100 % en el cliente**: el paquete `@linkshelf/core` quita parámetros de tracking, desenvuelve redirecciones de TLDR sin red, calcula el ID del documento como SHA-256 de la URL normalizada (duplicados exactos imposibles por construcción) y avisa de _posible duplicado_ por similitud de títulos antes de guardar.

## Modos

La app pública abre en **modo demo**. Nadie tiene que iniciar sesión para guardar, categorizar, limpiar parámetros de rastreo, detectar duplicados o buscar. El **modo personal** es solo para la cuenta de Hugo: después de un inicio de sesión permitido, la misma pantalla pasa a Cloud Firestore. Si otra cuenta entra con Google, ve que esta instancia es privada, se cierra esa sesión y sigue en el demo.

No hay un flag de build que obligue a todo el mundo a usar Firestore. El modo se elige en el cliente:

1. Sin sesión, o con una sesión que no está en la lista: demo.
2. Sesión cuyo UID o correo verificado está en la lista, y a la que las reglas de Firestore también dejan leer `users/{uid}`: personal.

La lista no va hardcodeada. Hace falta configurarla en **dos sitios**, y los dos tienen que decir lo mismo. El cliente decide la pantalla; las reglas son las que de verdad impiden que otra persona escriba en la base.

### Modo demo

- Los enlaces viven en `localStorage`, clave `linkshelf.demo.v1`. Cabe una biblioteca de uso personal; si se acerca al límite del navegador (unos 5 MB), el aviso pide exportar. La interfaz no depende de este motor: se puede cambiar a IndexedDB sin tocar las pantallas.
- La primera visita siembra seis enlaces de ejemplo, uno por categoría. Si los borras, no se vuelven a crear.
- Un aviso discreto dice que es una demo y que los datos se quedan en ese navegador.
- **Exportar JSON** e **Importar JSON** usan el formato `linkshelf-links` versión 1. Importar mezcla por id: crea los que faltan, actualiza los que ya están y no borra los que no vengan en el archivo. Un id que no sea el SHA-256 de la URL normalizada se omite.
- Buscar, filtrar, editar, importar favoritos en HTML y guardar desde la web funcionan igual, porque esa lógica está en `@linkshelf/core` y en el repositorio, no en Firestore.

### Modo personal

La extensión y la web usan `FirestoreLinkRepository` (la clase `LinksRepo`) solo para la cuenta permitida. La extensión no tiene modo demo: si la sesión no está en la lista, avisa que la instancia es privada y no escribe.

Variables de entorno, separadas por comas (también en los secrets de GitHub con el mismo nombre, para el build de Hosting):

```bash
LINKSHELF_ALLOWED_UIDS=elUidDeHugo
LINKSHELF_ALLOWED_EMAILS=hugo@gmail.com
```

- El **UID** es la forma segura de identificar la cuenta. Está en Firebase Console → Authentication, o en el token de la sesión. No depende de que el correo cambie.
- El **correo** es un respaldo. En las reglas solo vale si `email_verified` es verdadero, y tiene que estar **en minúsculas**, igual que el token de Google. El cliente también compara en minúsculas.
- Como máximo **10** UID y **10** correos. Con uno de cada uno alcanza.

En Firestore, documento `config/access` (la consola lo escribe como administrador; las reglas niegan lectura y escritura a cualquier cliente, así que nadie puede agregarse solo):

```json
{
  "uids": ["elUidDeHugo"],
  "emails": ["hugo@gmail.com"]
}
```

Si el documento no existe, o la cuenta no está, las reglas niegan todo `users/{uid}/**`, incluso la propia ruta de quien inició sesión. Los datos que ya estaban no se borran: simplemente nadie los lee hasta que el documento coincida.

Para probar el modo personal contra los emuladores, crea el mismo documento en la UI del emulador (`http://127.0.0.1:4000`) y pon el UID en `.env`. Sin eso, el emulador también se queda en demo.

## Funcionalidades

| MVP                                                                               | Fases posteriores                                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Guardar enlace desde extensión y web                                              | Importar favoritos de Chrome (HTML / `chrome.bookmarks`) con dedupe masivo |
| Limpieza de `utm_*`, `fbclid`, `gclid`, `ref`, tracking de TLDR…                  | Importar enlaces desde correos TLDR en Gmail                               |
| Resolución de redirecciones (extensión) y URL canónica                            | Sugerencia de categoría con LLM gratuito                                   |
| Aviso de duplicado exacto (ID = hash) y cercano (trigramas/Jaccard en el cliente) | Búsqueda de texto mejorada (índice local con MiniSearch)                   |
| Categoría principal + etiquetas secundarias                                       | Estado leído/no leído y favoritos                                          |
| Sugerencia de categoría por reglas                                                | Detección por hash de contenido                                            |
| Filtros por categoría, etiqueta, dominio, fecha                                   | Exportación HTML                                                           |
| Exportación e importación JSON en el modo demo                                    |                                                                            |

## Categorías

Cada enlace tiene **una categoría principal** y **cero o más etiquetas secundarias** (una etiqueta puede tener el mismo nombre que una categoría; ej. un tutorial de IA = `Tutoriales` + etiqueta `ia`).

| Categoría      | Contenido                                                             |
| -------------- | --------------------------------------------------------------------- |
| **Artículos**  | Artículos científicos de distintas disciplinas (arXiv, DOI, revistas) |
| **Tutoriales** | Guías paso a paso para hacer algo                                     |
| **Projects**   | Repositorios de GitHub interesantes                                   |
| **WebPages**   | Sitios interactivos: juegos, apps, colecciones de assets (uiverse…)   |
| **IA**         | Todo lo relacionado con inteligencia artificial                       |
| **Diseño**     | Artículos, guías e informes de diseño y diseño web                    |

## Stack

| Capa                 | Tecnología                                                                                               | Hosting / costo                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Web app              | Angular 22 (standalone, signals, zoneless), TypeScript strict                                            | Vercel Hobby — $0                                               |
| Extensión            | Manifest V3 + WXT (Vite) + TypeScript                                                                    | Carga local / Chrome Web Store opcional (USD 5 único, opcional) |
| Backend / BD         | Firebase: Cloud Firestore (edición Standard) + Firebase Auth (Google) + Security Rules                   | Plan Spark — $0, sin tarjeta                                    |
| Lógica de “servidor” | **Ninguna**: sin Cloud Functions (requieren plan Blaze). Todo corre en `@linkshelf/core` en el cliente   | —                                                               |
| Lógica compartida    | Paquete `@linkshelf/core` (normalizador, desenvolvedor TLDR, hash de ID, similitud, reglas de categoría) | —                                                               |
| Monorepo             | pnpm workspaces                                                                                          | —                                                               |
| Testing              | Vitest (unit), Firebase Emulator Suite + `@firebase/rules-unit-testing` (reglas), Playwright (e2e)       | —                                                               |
| CI                   | GitHub Actions                                                                                           | Gratis (repo público o cuota privada)                           |

## Estado

El sitio público es https://linkshelf-hugo.web.app (proyecto `linkshelf-hugo`, Spark, Firestore Standard en `nam5`, Auth con Google). Ahí el visitante entra en **modo demo**. El modo personal queda cerrado hasta que Hugo cargue su UID o su correo en la configuración y publique las reglas. La `apiKey` y el `appId` no están en el repo: van en `.env` o en los secrets de GitHub (`FIREBASE_*`). Hosting está en `firebase.json` y lo publica `.github/workflows/firebase-hosting.yml` (solo Hosting, e inyecta `LINKSHELF_ALLOWED_*` si esos secrets existen). Las reglas de Firestore están versionadas y **no se despliegan** desde ese workflow.

## Estructura del monorepo

```
link-manager/
├── apps/
│   ├── web/                 # Angular 22
│   └── extension/           # WXT (MV3)
├── packages/
│   └── core/                # @linkshelf/core: normalizador, tracking, reglas de categoría
├── firebase/
│   ├── firestore.rules      # Security Rules versionadas
│   ├── firestore.indexes.json
│   └── tests/               # tests de reglas con el emulador
├── firebase.json            # config de emuladores (Auth + Firestore)
├── .firebaserc              # alias del proyecto
├── docs/
│   ├── files/               # Documentación
│   └── screenshots/
├── .github/workflows/
├── pnpm-workspace.yaml
└── package.json
```

## Inicio rápido

```bash
corepack enable
pnpm install
cp .env.example .env            # opcional: sin apiKey se usan los emuladores
pnpm emulators                  # Auth :9099 y Firestore :8080, proyecto demo-linkshelf
pnpm dev                        # http://127.0.0.1:4200
pnpm dev:extension              # WXT abre Chrome con la extensión
pnpm test                       # Vitest de @linkshelf/core y del repositorio local
pnpm test:rules                 # Security Rules contra el emulador
pnpm e2e                        # Playwright contra los emuladores
```

La biblioteca abre sin cuenta. _Entrar_ es opcional. Con emuladores, el login muestra también _Entrar en local_. En producción (`FIREBASE_API_KEY` presente y `FIREBASE_USE_EMULATORS` distinto de `true`) el acceso a Firestore es solo con Google y solo si la cuenta está en la lista.

## Publicar el modo personal

No hace falta desplegar nada para que el demo siga en línea. Para que la cuenta de Hugo use Firestore, en este orden (así no te quedas afuera ni tocas los enlaces que ya existen):

1. En Firebase Console → Firestore, crea el documento `config/access` con `uids` y `emails` como arriba. La consola escribe como administrador y no pasa por las reglas.
2. Pon el mismo UID y el mismo correo en `.env` y en los secrets `LINKSHELF_ALLOWED_UIDS` y `LINKSHELF_ALLOWED_EMAILS`.
3. Reglas: `pnpm exec firebase deploy --only firestore:rules --project linkshelf-hugo`
4. Web, para que el bundle lleve la lista: `pnpm exec firebase deploy --only hosting --project linkshelf-hugo`  
   El workflow de GitHub hace este paso al empujar a `main` si los secrets de Firebase están completos. No publica reglas.
5. Extensión: `pnpm --filter @linkshelf/extension build` con el mismo `.env`, y vuelve a cargarla en el navegador.

La CSP de `firebase.json` no cambia (`script-src` sin `'unsafe-inline'`). El build de Angular deja `inlineCritical` en `false` para no meter un script inline de CSS.

## Roadmap (resumen)

0. Documentación y scaffolding
1. MVP: core + Firestore/Auth/Rules + web + extensión ← _este hito, sin deploy_
2. Importación de favoritos de Chrome con dedupe masivo
3. Importación desde Gmail (TLDR), leído/no leído, favoritos
4. Búsqueda local avanzada, sugerencia con LLM, hash de contenido

Detalle en [roadmap.md](docs/files/roadmap.md).

## Documentación

- [Visión y alcance](docs/files/vision-y-alcance.md)
- [Requisitos](docs/files/requisitos.md)
- [Arquitectura](docs/files/arquitectura.md)
- [Stack y servicios](docs/files/stack-y-servicios.md)
- [Modelo de datos](docs/files/modelo-de-datos.md)
- [API](docs/files/api.md)
- [Normalización y duplicados](docs/files/normalizacion-y-duplicados.md)
- [Categorización](docs/files/categorizacion.md)
- [Extensión de navegador](docs/files/extension-navegador.md)
- [Diseño UI/UX](docs/files/diseno.md)
- [Seguridad](docs/files/seguridad.md)
- [Testing](docs/files/testing.md)
- [Despliegue y CI](docs/files/despliegue-y-ci.md)
- [Roadmap](docs/files/roadmap.md)
- [Convenciones](docs/files/convenciones.md)

## Licencia

[MIT](LICENSE) © 2026 Hugo Fernando Colmenares
