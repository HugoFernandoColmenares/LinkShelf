> **Proyecto:** LinkShelf

# API

No hay backend propio ni endpoints HTTP propios. La "API" de LinkShelf son dos capas:

1. **Funciones puras de `@linkshelf/core`** (normalizar, desenvolver, hash, similitud, categoría).
2. **`LinkRepository` en `@linkshelf/firebase`**. `LocalLinkRepository` guarda el modo demo en `localStorage`. `LinksRepo` (`FirestoreLinkRepository`) envuelve el Firebase JS SDK modular para el modo personal. La extensión solo usa Firestore, y solo con una cuenta de la lista. Las Security Rules validan cada escritura.

## `@linkshelf/core`

```ts
// Normalización
export function unwrapKnownRedirects(input: string, maxDepth = 5): string; // sin red
export function normalizeUrl(input: string): string; // sin red
export function isTrackingParam(name: string, value: string, host: string): boolean;
export async function linkIdFor(normalizedUrl: string): Promise<string>; // sha256 hex
export function registrableDomain(host: string): string;

// Red (solo donde no hay CORS: extensión)
export async function resolveRedirects(
  url: string,
  opts?: { timeoutMs?: number; fetch?: typeof fetch },
): Promise<{ finalUrl: string; html?: string; hops: number }>;
export function extractMetadata(
  html: string,
  baseUrl: string,
): {
  title?: string;
  description?: string;
  imageUrl?: string;
  canonicalUrl?: string;
  ogType?: string;
};

// Duplicados
export function buildKeywords(title: string): string[];
export function titleSimilarity(a: string, b: string): number; // 0..1
export function findNearDuplicates(
  candidate: { title: string; normalizedUrl: string; canonicalUrl?: string },
  existing: LinkSummary[],
  thresholds?: { probable: number; possible: number },
): {
  level: 'none' | 'possible' | 'probable';
  matches: Array<{ id: string; score: number; reason: string }>;
};

// Categoría
export const CATEGORIES: readonly Category[];
export function suggestCategory(ctx: {
  url: string;
  title?: string;
  description?: string;
  ogType?: string;
}): { category: CategorySlug; tags: string[]; confidence: number; reasons: string[] };

// Orquestación completa sin E/S de Firestore
export async function prepareLink(input: {
  url: string;
  title?: string;
  html?: string;
  source?: LinkSource;
}): Promise<PreparedLink>; // { id, url, normalizedUrl, canonicalUrl, title, domain, keywords, suggestion, metaStatus }
```

## `LinksRepo` (Firestore)

```ts
const links = (uid: string) => collection(db, 'users', uid, 'links').withConverter(linkConverter);

export class LinksRepo {
  /** Duplicado exacto: 1 lectura (o 0 si está en caché). */
  getById(uid: string, id: string): Promise<Link | null>;

  /** Candidatos a duplicado cercano: mismo dominio, más recientes primero. */
  listByDomain(uid: string, domain: string, max = 100): Promise<LinkSummary[]>;

  /** Crea si no existe. Lanza DuplicateError('exact', existing) si ya existe. */
  create(
    uid: string,
    p: PreparedLink,
    choice: { category: CategorySlug; tags: string[]; note?: string },
  ): Promise<void>;

  update(uid: string, id: string, patch: Partial<Pick<Link, EditableField>>): Promise<void>;
  remove(uid: string, id: string): Promise<void>;

  /** Listener en tiempo real; devuelve unsubscribe. */
  watch(uid: string, q: LinkQuery, cb: (links: Link[]) => void): () => void;

  /** Fase 2: crea en lotes de 500, omitiendo IDs existentes. */
  bulkCreate(uid: string, items: PreparedLink[], batchId: string): Promise<BulkReport>;
}
```

### Listar con filtros

```ts
const q = query(
  links(uid),
  ...(f.category ? [where('category', '==', f.category)] : []),
  ...(f.tag ? [where('tags', 'array-contains', f.tag)] : []),
  ...(f.status ? [where('status', '==', f.status)] : []),
  orderBy('createdAt', 'desc'),
  limit(50),
);
onSnapshot(q, (snap) => store.set(snap.docs.map((d) => d.data())));
```

Firestore permite **un solo** `array-contains` por consulta: filtrar por varias etiquetas con modo _todas_ se resuelve en el cliente sobre el resultado del primer filtro. La búsqueda por texto libre se hace en memoria (`title`, `domain`, `tags`, `note`) y, en colecciones grandes, con `array-contains-any` sobre `keywords`.

### Crear (transacción)

```ts
async create(uid, p, choice) {
  const ref = doc(links(uid), p.id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new DuplicateError('exact', snap.data());
    tx.set(ref, {
      url: p.url, normalizedUrl: p.normalizedUrl, canonicalUrl: p.canonicalUrl ?? null,
      title: p.title, description: p.description ?? null, imageUrl: p.imageUrl ?? null,
      domain: p.domain, category: choice.category, suggestedCategory: p.suggestion.category,
      tags: choice.tags, keywords: p.keywords, status: 'unread', favorite: false,
      source: p.source, metaStatus: p.metaStatus, note: choice.note ?? null, importBatchId: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
}
```

> Las transacciones requieren conexión. Sin red, la extensión usa `setDoc` con la caché offline (la escritura se encola) y las reglas rechazan el `create` si al sincronizar el documento ya existía; el cliente muestra entonces "Ya estaba guardado".

### Flujo `saveLink` (lo que hacen popup, menú contextual y web)

| Paso                                                                                                             | Dónde            | Lecturas/escrituras                            |
| ---------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------- |
| 1. `prepareLink` (unwrap, normalize, hash, keywords, sugerencia)                                                 | core             | 0                                              |
| 2. (Solo extensión) `resolveRedirects` + `extractMetadata` si la URL no es de un wrapper conocido o falta título | core + red       | 0                                              |
| 3. `getById` → `exact`                                                                                           | Firestore        | 1 lectura                                      |
| 4. `listByDomain` + `findNearDuplicates` → `possible` / `probable`                                               | Firestore + core | ≤ 100 lecturas, normalmente 0 (caché/listener) |
| 5. Confirmación del usuario                                                                                      | UI               | —                                              |
| 6. `create` (transacción)                                                                                        | Firestore        | 1 lectura + 1 escritura                        |

## Respuesta de duplicados (contrato de UI)

```ts
type DuplicateCheck = {
  level: 'none' | 'possible' | 'probable' | 'exact';
  matches: Array<{
    id: string;
    title: string;
    domain: string;
    category: CategorySlug;
    createdAt: Date;
    score: number;
    reason: 'same-id' | 'same-canonical' | 'similar-title';
  }>;
};
```

## Errores

| Código                    | Origen    | Significado                                                     | Manejo en UI                                                                    |
| ------------------------- | --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `DuplicateError('exact')` | Repo      | El ID ya existe                                                 | "Ya guardaste este enlace" + _Ver existente_                                    |
| `permission-denied`       | Firestore | Reglas rechazan (sesión caducada, campo inválido, ID ≠ formato) | Reautenticar o mostrar campo inválido                                           |
| `resource-exhausted`      | Firestore | Cuota diaria Spark agotada                                      | "Cuota diaria agotada; se reintentará mañana" (escritura queda en cola offline) |
| `unavailable`             | Firestore | Sin red                                                         | Guardado en cola offline, indicador "Pendiente de sincronizar"                  |
| `InvalidUrlError`         | core      | Esquema no `http(s)` o URL ilegible                             | Validación en el formulario                                                     |
| `ResolveTimeoutError`     | core      | Redirecciones/HTML > 5 s                                        | Guardar con datos locales, `metaStatus: 'pending'`                              |

## Límites

- Tamaño de documento ≤ 1 MiB (un enlace usa ~2 KB).
- `writeBatch` ≤ 500 operaciones.
- `array-contains-any` / `in` ≤ 30 valores.
- 1 escritura/segundo sostenida por documento (irrelevante para este uso).
