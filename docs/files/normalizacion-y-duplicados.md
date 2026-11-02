> **Proyecto:** LinkShelf

# Normalización de URLs y detección de duplicados

Todo se implementa en el cliente, en `@linkshelf/core` (`packages/core/src/normalize.ts`, `unwrap.ts`, `similarity.ts`): funciones puras y deterministas que usan igual la web, la extensión y los tests. **No hay Cloud Functions** (requieren el plan Blaze); los pasos que necesitan red solo los ejecuta la extensión.

Detalles de la implementación: se descarta el userinfo (`usuario:clave@`), los hosts `neverssl.com` y `http.badssl.com` conservan `http`, y el dominio registrable usa un subconjunto de la Public Suffix List embebido en core (no el archivo completo).

## Algoritmo de normalización `normalizeUrl(input)`

Orden exacto (cada paso tiene tests):

1. **Trim** de espacios y caracteres invisibles (`\u200B`, `\uFEFF`).
2. **Parseo** con `new URL()`. Si no hay esquema, anteponer `https://`. Rechazar esquemas distintos de `http`/`https`.
3. **Desenvolver redirecciones conocidas sin red** (wrappers con la URL destino embebida):
   - `tracking.tldrnewsletter.com/CL0/<url-codificada>/<n>/<id>/<firma>` → tomar el segmento tras `CL0/` hasta el siguiente `/` **sin codificar** y aplicar `decodeURIComponent`. Funciona **sin red** porque la URL destino viaja dentro del enlace. `links.tldrnewsletter.com/<id>` (formato corto) sí requiere red.
   - `www.google.com/url?q=<url>`, `l.facebook.com/l.php?u=<url>`, `out.reddit.com/...?url=`, `t.co` (requiere red), `lnkd.in` (requiere red).
   - Se repite el paso (máx. 5) por si hay wrappers anidados.
4. **Esquema**: forzar `https` (lista corta en core de hosts conocidos sin https que conservan `http`).
5. **Host**: minúsculas, punycode→ASCII (lo hace `URL`), quitar `www.` y `m.` iniciales (solo `www.`, `www2.`, `m.`, `mobile.`), quitar punto final.
6. **Puerto**: eliminar puertos por defecto (`:80`, `:443`).
7. **Ruta**:
   - Decodificar escapes innecesarios (`%7E` → `~`) y codificar en mayúsculas los necesarios.
   - Resolver `.` y `..`; colapsar `//` repetidas.
   - Quitar `/` final (excepto la raíz `/`, que queda sin ruta: `https://example.com`).
   - Quitar `index.html`, `index.php`, `default.aspx` finales.
8. **Query**:
   - Eliminar parámetros de la lista de tracking (abajo), comparando nombre en minúsculas.
   - Eliminar parámetros vacíos (`?a=&b=1` → `?b=1`).
   - **Ordenar** alfabéticamente por nombre (y por valor si se repiten).
   - Si queda vacía, quitar `?`.
9. **Fragmento**: eliminar `#...`, excepto rutas hash-bang de SPAs (`#!/` o `#/`), que se conservan.
10. **Reglas por dominio** (ver abajo: GitHub, YouTube, arXiv, Medium).
11. Resultado: `URL.toString()`.

### Pasos que requieren red y límites de CORS

Un navegador no deja que una página web lea la respuesta de otro origen sin cabeceras CORS, ni ver los saltos de una redirección (`redirect: 'manual'` devuelve una respuesta opaca). Por eso:

| Contexto                                                                                             | Qué puede hacer                                                                                                                                                                   | Qué no                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Extensión** (popup, service worker) con `host_permissions` opcionales `https://*/*` y `http://*/*` | `fetch(url, { redirect: 'follow' })` y leer `response.url` (URL final) y el HTML (primeros 512 KB) para título, `og:*` y `rel=canonical`. Sin CORS gracias a los permisos de host | Ver cada salto intermedio (no hace falta: basta la URL final)                                                   |
| **Extensión** sin pedir permisos de host                                                             | Leer la **URL final de la pestaña** (`tab.url` con `activeTab`) cuando el usuario guarda la página que está viendo: el navegador ya siguió las redirecciones                      | Resolver enlaces que no se abrieron (menú contextual sobre un enlace)                                           |
| **Web app**                                                                                          | Desenvolver wrappers conocidos sin red (TLDR `CL0`, `google.com/url`, `l.facebook.com`) y normalizar                                                                              | Seguir redirecciones o leer metadatos de terceros (CORS). Se guarda la URL tal cual con `metaStatus: 'pending'` |

12. **Resolver redirecciones (extensión)**: `fetch` con `redirect: 'follow'`, `AbortSignal.timeout(5000)`, `HEAD` primero y `GET` si responde 405/403. La URL final vuelve a pasar por `normalizeUrl`. Si el permiso de host no fue concedido se usa la URL de la pestaña o se deja `pending`.
13. **Canonical**: leer `<link rel="canonical">` y `og:url`. Se usa como `canonicalUrl` solo si es del **mismo dominio registrable** y se normaliza. Si es válido, `normalizedUrl` = canonical normalizado (y por tanto el ID se calcula sobre él).
14. **Completar pendientes**: al abrir el popup o en segundo plano (alarma `chrome.alarms` cada 6 h, hasta 20 por ejecución), la extensión toma enlaces `metaStatus == 'pending'`, los resuelve y actualiza. Si la URL resuelta cambia el ID, se crea el documento nuevo y se borra el viejo en un `writeBatch` (o se fusiona si ya existía).

**Seguridad:** el `fetch` corre en el navegador del usuario (no es un servidor que pueda sufrir SSRF), se envía sin cookies (`credentials: 'omit'`) y se rechazan hosts de redes privadas o `localhost` para no tocar la red local.

## Lista de parámetros de tracking (`tracking-params.ts`)

**Por prefijo:** `utm_` (cubre `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `utm_name`…), `mtm_`, `pk_`, `hsa_`, `_hs`, `vero_`, `oly_`, `__s`.

**Exactos:**

| Origen    | Parámetros                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genéricos | `ref`, `ref_src`, `ref_url`, `referrer`, `source`_, `src`_, `campaign`, `via`                                                                             |
| Google    | `gclid`, `gclsrc`, `dclid`, `gbraid`, `wbraid`, `_ga`, `_gl`                                                                                              |
| Meta      | `fbclid`, `igshid`, `igsh`                                                                                                                                |
| Microsoft | `msclkid`                                                                                                                                                 |
| Mailchimp | `mc_cid`, `mc_eid`                                                                                                                                        |
| HubSpot   | `_hsenc`, `_hsmi`, `__hstc`, `__hssc`, `__hsfp`, `hsCtaTracking`                                                                                          |
| Marketo   | `mkt_tok`                                                                                                                                                 |
| Twitter/X | `twclid`, `s`** , `t`**                                                                                                                                   |
| LinkedIn  | `li_fat_id`, `trk`, `trackingId`                                                                                                                          |
| TikTok    | `ttclid`                                                                                                                                                  |
| Yandex    | `yclid`                                                                                                                                                   |
| Otros     | `wickedid`, `oly_anon_id`, `oly_enc_id`, `rb_clickid`, `ss_campaign_id`, `_bta_tid`, `_bta_c`, `cmpid`, `ncid`, `sr_share`                                |
| TLDR      | `utm_source=tldr*` (cubierto por prefijo), `tldr`, `tldrnewsletter` y los wrappers `tracking.tldrnewsletter.com/CL0/...` y `links.tldrnewsletter.com/...` |

\* `source` y `src` solo se eliminan si su valor contiene `newsletter`, `tldr`, `email`, `twitter`, `rss` (pueden ser funcionales en algunos sitios).
\** `s` y `t` solo en hosts `x.com` / `twitter.com`.

Lista blanca por dominio que **nunca** se toca: `youtube.com` (`v`, `t`, `list`), `google.com/search` (`q`), `news.ycombinator.com` (`id`).

## Reglas por dominio

| Dominio                    | Regla                                                                                                                                                                                                                                  | Ejemplo                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `github.com`               | Owner/repo en minúsculas; quitar `.git`; reducir `/tree/<rama>`, `/blob/<rama>/README.md`, `/#readme`, `/stargazers`, `/issues` (solo listado) al repo raíz. Se conservan rutas a archivos concretos, issues/PRs con número y releases | `github.com/Vercel/AI/tree/main#readme` → `github.com/vercel/ai` |
| `youtu.be`                 | → `youtube.com/watch?v=<id>`                                                                                                                                                                                                           |                                                                  |
| `youtube.com`              | Mantener solo `v`, `list`                                                                                                                                                                                                              |                                                                  |
| `arxiv.org`                | `/pdf/2401.01234v2.pdf` → `/abs/2401.01234` (sin versión)                                                                                                                                                                              |                                                                  |
| `doi.org`, `dx.doi.org`    | Host `doi.org`, DOI en minúsculas                                                                                                                                                                                                      |                                                                  |
| `medium.com` y subdominios | Quitar `source` y sufijo de hash en el slug no se toca                                                                                                                                                                                 |                                                                  |
| `amazon.*`                 | Reducir a `/dp/<ASIN>`                                                                                                                                                                                                                 |                                                                  |

## Ejemplos antes/después

| #   | Entrada                                                                                                                   | `normalizedUrl`                                |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | `https://www.Example.com/post/?utm_source=tldrnewsletter&utm_medium=email`                                                | `https://example.com/post`                     |
| 2   | `http://example.com:80/a//b/./c/index.html#section`                                                                       | `https://example.com/a/b/c`                    |
| 3   | `https://example.com/search?z=1&a=2&fbclid=IwAR0x`                                                                        | `https://example.com/search?a=2&z=1`           |
| 4   | `https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fblog.example.com%2Fai-agents%3Futm_source=tldrai/1/0100019a.../abc=` | `https://blog.example.com/ai-agents`           |
| 5   | `https://github.com/Microsoft/TypeScript.git`                                                                             | `https://github.com/microsoft/typescript`      |
| 6   | `https://github.com/vercel/next.js/blob/canary/README.md?ref=tldr`                                                        | `https://github.com/vercel/next.js`            |
| 7   | `https://github.com/vercel/next.js/issues/123`                                                                            | `https://github.com/vercel/next.js/issues/123` |
| 8   | `https://arxiv.org/pdf/2401.01234v3.pdf`                                                                                  | `https://arxiv.org/abs/2401.01234`             |
| 9   | `https://youtu.be/dQw4w9WgXcQ?si=abc&t=42`                                                                                | `https://youtube.com/watch?t=42&v=dQw4w9WgXcQ` |
| 10  | `https://example.com/?mc_cid=123&mc_eid=456&ref=producthunt`                                                              | `https://example.com`                          |
| 11  | `https://app.example.com/#/dashboard?utm_campaign=x`                                                                      | `https://app.example.com/#/dashboard`          |
| 12  | `https://www.google.com/url?q=https://uiverse.io/buttons&sa=D`                                                            | `https://uiverse.io/buttons`                   |

## Detección de duplicados

Se calcula en el cliente (`findNearDuplicates` en core) tanto al guardar uno a uno como en la importación masiva.

| Señal                                                            | Puntaje           | Nivel                                         | Costo en Firestore                  |
| ---------------------------------------------------------------- | ----------------- | --------------------------------------------- | ----------------------------------- |
| Mismo ID (`sha256Hex(normalizedUrl)`)                            | 1,00              | `exact` (bloquea: imposible por construcción) | 1 `getDoc`                          |
| `canonicalUrl` idéntica a la de otro enlace del dominio          | 0,95              | `probable`                                    | incluida en la consulta por dominio |
| `contentHash` idéntico (Fase 4)                                  | 0,95              | `probable`                                    | —                                   |
| Mismo dominio + `titleSimilarity ≥ 0,80`                         | = similitud       | `probable`                                    | consulta por dominio                |
| Mismo dominio + `titleSimilarity ≥ 0,60`, o misma ruta sin query | = similitud × 0,9 | `possible` (permite _Guardar igual_)          | consulta por dominio                |
| < 0,60                                                           | —                 | `none`                                        | —                                   |

### Algoritmo de similitud (`similarity.ts`)

1. `normTitle(t)`: minúsculas, sin acentos, sin puntuación, espacios colapsados; se quitan sufijos de sitio (`" | Medium"`, `" - YouTube"`, `" · GitHub"`).
2. Trigramas: para cada palabra con relleno `"  palabra "`, todas las subcadenas de 3 caracteres (esquema clásico de trigramas, implementado en TS).
3. **Jaccard** = |A ∩ B| / |A ∪ B| sobre los conjuntos de trigramas.
4. Se ignoran títulos < 8 caracteres o genéricos (`Home`, `GitHub`, `Untitled`, `Inicio`).

```ts
titleSimilarity(
  'How to build a RAG app step by step',
  'How to Build a RAG App, Step-by-Step | Medium',
); // ≈ 0.93 → probable
titleSimilarity('Attention is all you need', 'Attention in transformers explained'); // ≈ 0.35 → none
```

### Por qué solo dentro del mismo dominio

- Mantiene la consulta acotada (`where('domain','==',d)`, ≤ 100 docs, casi siempre desde caché o desde el listener en memoria de la web).
- Entre dominios distintos los títulos parecidos suelen ser artículos distintos sobre el mismo tema. La comparación global queda para la pantalla `/duplicates` (Fase 2), que opera sobre el arreglo completo en memoria sin lecturas extra.

Los umbrales (`0,8` y `0,6`) son configurables en `users/{uid}.similarityThresholds`. `level` de la respuesta = el mayor nivel entre los candidatos.

### Comportamiento en UI

- `exact`: "Ya guardaste este enlace el 14/10/2026 en _Tutoriales_" → botones _Ver existente_ / _Actualizar etiquetas_.
- `probable` / `possible`: "Posible duplicado" con lista de candidatos y puntaje (ej. 92 %) → _Guardar igual_ / _Ver_ / _Cancelar_.
- **Nunca** se descarta en silencio; en importaciones masivas los duplicados se listan en el informe del lote.

### Hash de contenido (Fase 4)

SHA-256 del texto principal extraído (título + primeros 2 000 caracteres de `<article>`/`<main>`, normalizados en espacios y minúsculas). Detecta el mismo artículo publicado bajo URLs distintas (sindicación, AMP).
