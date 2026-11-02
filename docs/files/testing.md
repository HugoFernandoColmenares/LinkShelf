> **Proyecto:** LinkShelf

# Estrategia de testing

## Pirámide
| Nivel | Herramienta | Alcance | Ubicación |
|---|---|---|---|
| Unitario | **Vitest** | `@linkshelf/core` (normalizador, tracking, GitHub, categorización), servicios y stores de Angular, lógica de la extensión | `packages/core/test`, `apps/*/src/**/*.spec.ts` |
| Componentes | Vitest + Angular Testing Library | Componentes de la web y del popup | `*.spec.ts` |
| BD | `supabase test db` (pgTAP) | RLS, RPCs, restricciones | `supabase/tests/*.sql` |
| Edge Function | `deno test` con fetch simulado | Redirecciones, SSRF, parseo de metadatos | `supabase/functions/normalize-link/*.test.ts` |
| E2E | **Playwright** | Flujos web completos contra Supabase local | `apps/web/e2e` |
| Extensión E2E (opcional) | Playwright con `launchPersistentContext` + `--load-extension` | Popup y menú contextual en Chromium | `apps/extension/e2e` |
| Accesibilidad | `@axe-core/playwright` | Todas las pantallas | en e2e |

## `@linkshelf/core` (crítico)
- Cobertura objetivo **≥ 90 %** líneas y ramas (umbral en `vitest.config.ts`, CI falla si baja).
- **Tabla de casos** (`test/fixtures/urls.json`) con pares `entrada → esperado`, incluidos todos los ejemplos de [normalizacion-y-duplicados.md](normalizacion-y-duplicados.md) y URLs reales de correos TLDR anonimizadas.
- Propiedades (con `fast-check`):
  - **Idempotencia**: `normalize(normalize(x)) === normalize(x)`.
  - Nunca deja parámetros de la lista de tracking.
  - El resultado siempre es una URL válida `https?:`.
- Categorización: cada regla tiene al menos un caso positivo y uno negativo; tabla de ejemplos de [categorizacion.md](categorizacion.md).

```ts
describe('normalizeUrl', () => {
  it.each(fixtures)('$input → $expected', ({ input, expected }) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});
```

## Base de datos (pgTAP)
- Usuario A no ve, actualiza ni borra enlaces de B (`set request.jwt.claims`).
- `anon` no lee nada.
- `unique (user_id, normalized_url)` rechaza duplicados del mismo usuario pero permite la misma URL a otro usuario.
- `find_duplicates` devuelve `exact`, `canonical` y `similar_title` con los umbrales esperados.
- `link_tags` no permite asociar un tag de otro usuario.

## E2E (Playwright)
Escenarios mínimos:
1. Login con OTP (Supabase local expone los emails en Inbucket/Mailpit).
2. Guardar URL con `utm_*` → se muestra limpia y se guarda.
3. Guardar la misma URL con otro tracking → aviso "Ya guardaste este enlace".
4. Título similar → "Posible duplicado" → *Guardar igual*.
5. Filtrar por categoría + etiqueta + texto; recargar conserva filtros (query params).
6. Editar categoría y etiquetas; eliminar con confirmación.
7. Accesibilidad sin violaciones serias en P1-P5.

La Edge Function se ejecuta con `supabase functions serve`; las URLs externas se apuntan a un servidor de fixtures local (variable `NORMALIZE_TEST_ORIGIN`) para no depender de Internet.

## Comandos
```bash
pnpm test                  # vitest en todos los paquetes
pnpm test:coverage
pnpm --filter core test --watch
pnpm supabase test db
pnpm --filter web e2e      # requiere supabase start
deno test supabase/functions
```

## Definición de "hecho" (testing)
- Toda función nueva en `core` con tests.
- Toda migración con test pgTAP de RLS si crea tabla.
- Todo bug con un test que lo reproduce antes del fix.
