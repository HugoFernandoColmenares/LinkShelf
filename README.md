<!-- Nombre del proyecto: cambiarlo aquí y en la primera línea de cada doc -->
> **Proyecto:** LinkShelf

# LinkShelf

Gestor personal de enlaces con base de datos en la nube y extensión de navegador. Guarda, limpia, deduplica y categoriza los artículos que encuentras (por ejemplo, en el newsletter **TLDR**) sin depender de los favoritos de un navegador concreto.

## El problema

Los favoritos del navegador crecieron sin control: cientos de enlaces de TLDR, muchos **duplicados** (misma URL con distintos `utm_*`, con o sin `www`, con o sin `/` final, o envueltos en redirecciones de tracking del newsletter), mezclados en carpetas poco consistentes y atados a un solo navegador.

## La solución

- **Base de datos como fuente de verdad** (Firebase: Cloud Firestore + Auth, plan gratuito Spark): cualquier navegador o dispositivo lee la misma colección.
- **Extensión de navegador** (Chrome, Edge, Brave, Firefox) para guardar la pestaña actual en un clic o desde el menú contextual *Guardar enlace*.
- **Web app** (Angular) para buscar, filtrar, editar y limpiar la colección.
- **Normalización y deduplicación inteligente, 100 % en el cliente**: el paquete `@linkshelf/core` quita parámetros de tracking, desenvuelve redirecciones de TLDR sin red, calcula el ID del documento como SHA-256 de la URL normalizada (duplicados exactos imposibles por construcción) y avisa de *posible duplicado* por similitud de títulos antes de guardar.

## Funcionalidades

| MVP | Fases posteriores |
|---|---|
| Guardar enlace desde extensión y web | Importar favoritos de Chrome (HTML / `chrome.bookmarks`) con dedupe masivo |
| Limpieza de `utm_*`, `fbclid`, `gclid`, `ref`, tracking de TLDR… | Importar enlaces desde correos TLDR en Gmail |
| Resolución de redirecciones (extensión) y URL canónica | Sugerencia de categoría con LLM gratuito |
| Aviso de duplicado exacto (ID = hash) y cercano (trigramas/Jaccard en el cliente) | Búsqueda de texto mejorada (índice local con MiniSearch) |
| Categoría principal + etiquetas secundarias | Estado leído/no leído y favoritos |
| Sugerencia de categoría por reglas | Detección por hash de contenido |
| Filtros por categoría, etiqueta, dominio, fecha | Exportación JSON/HTML |

## Categorías

Cada enlace tiene **una categoría principal** y **cero o más etiquetas secundarias** (una etiqueta puede tener el mismo nombre que una categoría; ej. un tutorial de IA = `Tutoriales` + etiqueta `ia`).

| Categoría | Contenido |
|---|---|
| **Artículos** | Artículos científicos de distintas disciplinas (arXiv, DOI, revistas) |
| **Tutoriales** | Guías paso a paso para hacer algo |
| **Projects** | Repositorios de GitHub interesantes |
| **WebPages** | Sitios interactivos: juegos, apps, colecciones de assets (uiverse…) |
| **IA** | Todo lo relacionado con inteligencia artificial |
| **Diseño** | Artículos, guías e informes de diseño y diseño web |

## Stack

| Capa | Tecnología | Hosting / costo |
|---|---|---|
| Web app | Angular 22 (standalone, signals, zoneless), TypeScript strict | Vercel Hobby — $0 |
| Extensión | Manifest V3 + WXT (Vite) + TypeScript | Carga local / Chrome Web Store opcional (USD 5 único, opcional) |
| Backend / BD | Firebase: Cloud Firestore (edición Standard) + Firebase Auth (Google) + Security Rules | Plan Spark — $0, sin tarjeta |
| Lógica de “servidor” | **Ninguna**: sin Cloud Functions (requieren plan Blaze). Todo corre en `@linkshelf/core` en el cliente | — |
| Lógica compartida | Paquete `@linkshelf/core` (normalizador, desenvolvedor TLDR, hash de ID, similitud, reglas de categoría) | — |
| Monorepo | pnpm workspaces | — |
| Testing | Vitest (unit), Firebase Emulator Suite + `@firebase/rules-unit-testing` (reglas), Playwright (e2e) | — |
| CI | GitHub Actions | Gratis (repo público o cuota privada) |

## Estructura del monorepo (planeada)

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

## Inicio rápido (comandos planeados)

```bash
corepack enable
pnpm install
cp .env.example .env            # completar valores
pnpm firebase emulators:start   # Auth + Firestore locales (requiere Java 11+)
pnpm --filter web dev           # http://localhost:4200
pnpm --filter extension dev     # abre Chrome con la extensión cargada
pnpm test                       # Vitest en todo el monorepo
pnpm test:rules                 # Security Rules contra el emulador
pnpm --filter web e2e           # Playwright
```

## Roadmap (resumen)

0. Documentación y scaffolding ← *estamos aquí*
1. MVP: core + Firestore/Auth/Rules + web + extensión
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
