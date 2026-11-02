> **Proyecto:** LinkShelf

# Convenciones

## Idioma
- Documentación, commits, PRs e interfaz: **español (Latinoamérica)**.
- Código (variables, funciones, tablas, columnas): **inglés**. Slugs de categoría en español ASCII (`diseno`, `articulos`).

## Ramas (GitHub Flow simplificado)
- `main`: siempre desplegable; protegida (PR + CI verde).
- Ramas de trabajo: `<tipo>/<descripcion-corta>` → `feat/popup-duplicados`, `fix/normalizar-github`, `docs/api`, `chore/ci-cache`.
- Merge por *squash*; el título del PR es el mensaje final y sigue Conventional Commits.

## Conventional Commits (en español)
Formato: `<tipo>(<ámbito>): <descripción en imperativo y minúscula>`

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de error |
| `docs` | Documentación |
| `refactor` | Cambio sin alterar comportamiento |
| `test` | Tests |
| `chore` | Mantenimiento, dependencias |
| `ci` | Workflows |
| `perf` | Rendimiento |
| `style` | Formato sin cambios lógicos |

Ámbitos: `core`, `web`, `ext`, `db`, `fn`, `ci`, `docs`.

Ejemplos:
```
feat(core): elimina parámetros de rastreo de mailchimp
fix(ext): evita doble guardado desde el menú contextual
feat(db)!: cambia categories a tabla con slug

BREAKING CHANGE: el enum category_type se reemplaza por la tabla categories.
```
Validado con `commitlint` + `husky` (`commit-msg`).

## Estilo de código
- TypeScript `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Prettier: 2 espacios, comillas simples, `printWidth` 100, trailing commas.
- ESLint: `typescript-eslint` estricto, `angular-eslint`, sin `any` explícito.
- Nombres: `camelCase` variables/funciones, `PascalCase` tipos/clases, `kebab-case` archivos, `snake_case` en SQL.
- Prefijo de selectores Angular: `ls-`.

### Angular
- Solo standalone components, `ChangeDetectionStrategy.OnPush`, zoneless.
- Estado con `signal`, `computed`, `linkedSignal`, `resource`; `input()`/`output()`/`model()` en lugar de decoradores.
- Control flow nativo (`@if`, `@for` con `track`), `inject()` en lugar de constructor.
- Componentes presentacionales en `shared/ui`, inteligentes en `features/*`.
- Prohibido `innerHTML` con datos de enlaces.

### SQL
- Una migración por cambio lógico, nombres descriptivos (`<timestamp>_add_link_tags.sql`).
- Toda tabla nueva: `enable row level security` + políticas + test pgTAP.

### Extensión
- `browser.*` (WXT) en lugar de `chrome.*`.
- Ningún permiso nuevo sin actualizar la tabla de [extension-navegador.md](extension-navegador.md).

## Pull requests
- Plantilla: qué cambia, por qué, cómo probar, capturas (en `docs/screenshots/` si son de documentación).
- Checklist: tests, docs actualizadas, sin secretos, accesibilidad revisada.

## Documentación
- Cada doc empieza con la línea `> **Proyecto:** LinkShelf` (para renombrar, reemplazar en esa línea de cada archivo y en el README).
- Diagramas en Mermaid; decisiones relevantes como ADR en [arquitectura.md](arquitectura.md).
