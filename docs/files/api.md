> **Proyecto:** LinkShelf

# API

No hay backend propio: la API es **PostgREST** (vía `@supabase/supabase-js`) + **RPCs** en Postgres + la Edge Function **`normalize-link`**. Todas las llamadas llevan el JWT del usuario (`Authorization: Bearer <access_token>`) y la `apikey` anon.

## Consultas con supabase-js

### Listar con filtros
```ts
let q = supabase
  .from('links')
  .select('id, normalized_url, title, description, image_url, domain, category_slug, created_at, tags(slug, name)', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(offset, offset + 29);

if (filters.category) q = q.eq('category_slug', filters.category);
if (filters.domain)   q = q.eq('domain', filters.domain);
if (filters.from)     q = q.gte('created_at', filters.from);
if (filters.to)       q = q.lte('created_at', filters.to);
```
Para filtrar por etiquetas y texto difuso se usa la RPC `search_links`.

### Editar / eliminar
```ts
await supabase.from('links').update({ category_slug: 'ia', note: '...' }).eq('id', id);
await supabase.from('links').delete().eq('id', id);
```

## RPCs

### `find_duplicates(p_normalized_url text, p_canonical_url text, p_title text)`
Devuelve hasta 5 candidatos con puntaje (ver [normalizacion-y-duplicados.md](normalizacion-y-duplicados.md)).

```sql
create or replace function public.find_duplicates(
  p_normalized_url text, p_canonical_url text default null, p_title text default null)
returns table (id uuid, normalized_url text, title text, category_slug text,
               created_at timestamptz, match_type text, score real)
language sql stable security invoker set search_path = public as $$
  select l.id, l.normalized_url, l.title, l.category_slug, l.created_at,
         case when l.normalized_url = p_normalized_url then 'exact'
              when p_canonical_url is not null and l.canonical_url = p_canonical_url then 'canonical'
              else 'similar_title' end,
         case when l.normalized_url = p_normalized_url then 1.0
              when p_canonical_url is not null and l.canonical_url = p_canonical_url then 0.95
              else similarity(f_unaccent(lower(l.title)), f_unaccent(lower(coalesce(p_title,'')))) end::real
  from links l
  where l.user_id = auth.uid()
    and ( l.normalized_url = p_normalized_url
       or (p_canonical_url is not null and l.canonical_url = p_canonical_url)
       or (p_title is not null and length(p_title) >= 8
           and f_unaccent(lower(l.title)) % f_unaccent(lower(p_title))) )
  order by 7 desc
  limit 5;
$$;
```
`security invoker` ⇒ RLS sigue aplicando.

### `save_link(payload jsonb)`
Inserta el enlace y sus etiquetas (creándolas si no existen) en una transacción. Si `normalized_url` ya existe devuelve `{ "status": "exists", "id": ... }` en lugar de error.

```json
// entrada
{
  "original_url": "https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fgithub.com%2Fvercel%2Fai%3Futm_source=tldr/1/abc",
  "normalized_url": "https://github.com/vercel/ai",
  "canonical_url": "https://github.com/vercel/ai",
  "title": "vercel/ai: The AI Toolkit for TypeScript",
  "description": "The AI Toolkit for TypeScript...",
  "image_url": "https://opengraph.githubassets.com/.../vercel/ai",
  "category_slug": "projects",
  "suggested_category": "projects",
  "tags": ["ia", "typescript"],
  "note": null,
  "force": false
}
// salida
{ "status": "created", "id": "5b0e9c1e-0b1f-4a8e-9d5e-1c3f0a7d2b11" }
```
`force: true` permite guardar pese a un posible duplicado (nunca pese a uno exacto: lo impide el `unique`).

### `search_links(p_query text, p_category text, p_tags text[], p_tags_mode text, p_limit int, p_offset int)`
- `p_query`: coincidencia difusa sobre título/descripción/dominio usando `f_unaccent(lower(...)) %` y `ilike`, ordenado por `similarity` desc y luego `created_at` desc.
- `p_tags_mode`: `'any'` (OR) o `'all'` (AND).

### `bulk_check_duplicates(p_urls text[])` (Fase 2)
Para importaciones: recibe URLs ya normalizadas y devuelve cuáles existen.

## Edge Function `normalize-link`

`POST https://<ref>.supabase.co/functions/v1/normalize-link`

Headers: `Authorization: Bearer <jwt>`, `apikey: <anon>`, `Content-Type: application/json`.
JWT verificado (`verify_jwt = true`). CORS: orígenes `https://linkshelf.vercel.app`, `http://localhost:4200` y `chrome-extension://<id>` / `moz-extension://<id>`.

### Request
```json
{
  "url": "https://www.example.com/blog/post/?utm_source=tldrnewsletter&utm_medium=email&id=7#comments",
  "title": "Título que vio el navegador (opcional, fallback)",
  "checkDuplicates": true
}
```
Lote (Fase 2): `{ "urls": ["...", "..."], "checkDuplicates": true }` (máx. 50).

### Response 200
```json
{
  "originalUrl": "https://www.example.com/blog/post/?utm_source=tldrnewsletter&utm_medium=email&id=7#comments",
  "finalUrl": "https://example.com/blog/post?id=7",
  "normalizedUrl": "https://example.com/blog/post?id=7",
  "canonicalUrl": "https://example.com/blog/post",
  "redirects": 0,
  "removedParams": ["utm_source", "utm_medium"],
  "metadata": {
    "title": "Cómo construir un agente con TypeScript",
    "description": "Guía paso a paso...",
    "imageUrl": "https://example.com/og.png",
    "siteName": "Example Blog",
    "domain": "example.com",
    "lang": "es"
  },
  "suggestion": {
    "category": "tutoriales",
    "tags": ["ia"],
    "confidence": 0.8,
    "reasons": ["keyword:'paso a paso' -> tutoriales", "keyword:'agente' -> tag ia"]
  },
  "duplicates": [
    {
      "id": "0c7c...",
      "normalizedUrl": "https://example.com/blog/post?id=7&lang=es",
      "title": "Cómo construir un agente con TypeScript",
      "categorySlug": "tutoriales",
      "createdAt": "2026-10-14T15:02:11Z",
      "matchType": "similar_title",
      "score": 0.92
    }
  ],
  "duplicateLevel": "probable",
  "fetchStatus": "ok"
}
```
`duplicateLevel`: `none` | `possible` | `probable` | `exact`. `fetchStatus`: `ok` | `timeout` | `blocked` | `not_html`.

### Errores
| HTTP | `code` | Caso |
|---|---|---|
| 400 | `invalid_url` | No es http(s) o mal formada |
| 400 | `blocked_host` | IP privada/localhost (protección SSRF) |
| 401 | `unauthorized` | JWT ausente o inválido |
| 413 | `batch_too_large` | Más de 50 URLs |
| 429 | `rate_limited` | > 60 req/min por usuario |
| 500 | `internal` | Error inesperado |

```json
{ "error": { "code": "invalid_url", "message": "La URL debe usar http o https" } }
```
Si el fetch falla (timeout/bloqueo) la respuesta sigue siendo **200** con `fetchStatus` distinto de `ok` y la normalización local aplicada.
