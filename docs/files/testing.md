> **Proyecto:** LinkShelf

# Estrategia de testing

## Pirámide

| Nivel                    | Herramienta                                                                   | Alcance                                                                                                                                                      | Ubicación                                       |
| ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Unitario                 | **Vitest**                                                                    | `@linkshelf/core` (normalizador, desenvolvedor TLDR, tracking, hash de ID, similitud, categorización), servicios y stores de Angular, lógica de la extensión | `packages/core/test`, `apps/*/src/**/*.spec.ts` |
| Componentes              | Vitest + Angular Testing Library                                              | Componentes de la web y del popup                                                                                                                            | `*.spec.ts`                                     |
| Reglas                   | **Firebase Emulator Suite** + **`@firebase/rules-unit-testing`** (con Vitest) | Security Rules: aislamiento, validación de esquema, inmutabilidad, forma del ID                                                                              | `firebase/tests/*.test.ts`                      |
| Integración              | Vitest + emulador de Firestore/Auth                                           | `LinksRepo` (transacción de creación, lotes, convertidores)                                                                                                  | `packages/firebase/test`                        |
| E2E                      | **Playwright**                                                                | Flujos web completos contra los emuladores                                                                                                                   | `apps/web/e2e`                                  |
| Extensión E2E (opcional) | Playwright con `launchPersistentContext` + `--load-extension`                 | Popup y menú contextual en Chromium                                                                                                                          | `apps/extension/e2e`                            |
| Accesibilidad            | `@axe-core/playwright`                                                        | Todas las pantallas                                                                                                                                          | en e2e                                          |

## `@linkshelf/core` (crítico)

- Cobertura objetivo **≥ 90 %** líneas y ramas (umbral en `vitest.config.ts`, CI falla si baja).
- **Tabla de casos** (`test/fixtures/urls.json`) con pares `entrada → esperado`, incluidos todos los ejemplos de [normalizacion-y-duplicados.md](normalizacion-y-duplicados.md) y URLs reales de correos TLDR anonimizadas (formato `tracking.tldrnewsletter.com/CL0/...`).
- Propiedades (con `fast-check`):
  - **Idempotencia**: `normalize(normalize(x)) === normalize(x)`.
  - Nunca deja parámetros de la lista de tracking.
  - El resultado siempre es una URL válida `https?:`.
  - **Estabilidad del ID**: dos variantes de la misma URL (con/sin `www`, `utm_*`, `/` final, wrapper TLDR) producen el mismo `linkIdFor`.
  - `linkIdFor` siempre cumple `^[0-9a-f]{64}$` (misma expresión que las reglas).
- Vectores conocidos de SHA-256 para `linkIdFor` (para detectar cambios accidentales que invalidarían IDs existentes).
- Similitud: `titleSimilarity` simétrica, `= 1` para títulos iguales tras normalizar, casos frontera en 0,6 y 0,8.
- `resolveRedirects` con `fetch` inyectado (simulado): cadena de 3 redirecciones, timeout, `HEAD` 405 → `GET`, host privado rechazado.
- Categorización: cada regla tiene al menos un caso positivo y uno negativo; tabla de ejemplos de [categorizacion.md](categorizacion.md).

```ts
describe('normalizeUrl', () => {
  it.each(fixtures)('$input → $expected', ({ input, expected }) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});
```

## Security Rules (emulador)

```ts
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-linkshelf', // prefijo demo-: nunca toca un proyecto real
  firestore: {
    rules: readFileSync('firebase/firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});
const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const id = 'a'.repeat(64);

it('el dueño crea un enlace válido', () =>
  assertSucceeds(setDoc(doc(alice, `users/alice/links/${id}`), validLink())));
it('otro usuario no puede leerlo', () => assertFails(getDoc(doc(bob, `users/alice/links/${id}`))));
it('sin sesión no se lee nada', () =>
  assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `users/alice/links/${id}`))));
```

Casos obligatorios:

- Usuario A no lee, crea, actualiza ni borra en `users/B/**`; sin sesión, todo denegado.
- `create` rechaza ID que no sea hex de 64, categoría fuera de la lista, `tags` > 10, campos extra, `title` vacío, `createdAt` ≠ `request.time`.
- `update` rechaza cambiar `normalizedUrl`, `url`, `createdAt` o `source`.
- Escribir sobre un ID existente con datos "nuevos" (intento de duplicado) falla por inmutabilidad.
- `domainRules` acepta solo categorías válidas.
- Ruta no declarada (`/foo/bar`) denegada.

## E2E (Playwright)

Se ejecutan contra **`firebase emulators:exec`** (Auth + Firestore, proyecto `demo-linkshelf`), con la web en modo `FIREBASE_USE_EMULATORS=true` (`connectAuthEmulator`, `connectFirestoreEmulator`). El login con Google se simula con el emulador de Auth (pantalla de cuentas falsas) o creando el usuario por la REST API del emulador y usando `signInWithCredential` con un token de prueba.

Escenarios mínimos:

1. Login con el emulador de Auth.
2. Guardar URL con `utm_*` → se muestra limpia y se guarda.
3. Guardar la misma URL con otro tracking o envuelta en `tracking.tldrnewsletter.com/CL0/...` → aviso "Ya guardaste este enlace".
4. Título similar en el mismo dominio → "Posible duplicado" → _Guardar igual_.
5. Filtrar por categoría + etiqueta + texto; recargar conserva filtros (query params).
6. Editar categoría y etiquetas; eliminar con confirmación.
7. Cambio hecho por otro cliente (escrito directo en el emulador) aparece en tiempo real.
8. Accesibilidad sin violaciones serias en P1-P5.

Las URLs externas de la extensión se apuntan a un servidor de fixtures local para no depender de Internet.

## Comandos

```bash
pnpm test                         # vitest en todos los paquetes (sin emulador)
pnpm test:coverage
pnpm --filter core test --watch
pnpm test:rules                   # firebase emulators:exec --only firestore "vitest run firebase/tests"
pnpm --filter web e2e             # firebase emulators:exec --only auth,firestore "playwright test"
```

El emulador requiere **Java 11+** (en CI: `actions/setup-java`). La UI del emulador (`http://127.0.0.1:4000`) permite inspeccionar datos y solicitudes de reglas.

## Definición de "hecho" (testing)

- Toda función nueva en `core` con tests.
- Todo cambio en `firestore.rules` con tests de casos permitidos **y** denegados.
- Todo cambio en `normalizeUrl` que altere IDs incluye migración y sube `normalizerVersion`.
- Todo bug con un test que lo reproduce antes del fix.
