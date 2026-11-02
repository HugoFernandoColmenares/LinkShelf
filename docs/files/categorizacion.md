> **Proyecto:** LinkShelf

# Categorización

## Modelo: categoría principal + etiquetas secundarias
- Cada enlace tiene **exactamente una** `category` (para filtrar sin ambigüedad).
- Y **0..10 etiquetas** libres por usuario. Las categorías tienen etiqueta homónima sugerida (`ia`, `diseno`, `tutorial`…), de modo que "tutorial de IA" = categoría `tutoriales` + etiqueta `ia`, y filtrar por "IA" puede incluir opcionalmente enlaces etiquetados `ia` (toggle *Incluir etiquetas* en la UI).

## Definiciones

| Slug | Nombre | Incluye | No incluye | Ejemplos |
|---|---|---|---|---|
| `articulos` | Artículos | Papers científicos, preprints, revistas, estudios de cualquier disciplina | Posts de opinión en blogs (→ por tema) | arxiv.org, nature.com, doi.org |
| `tutoriales` | Tutoriales | Guías paso a paso, how-tos, cursos, "Building X with Y" | Documentación de referencia genérica | dev.to/how-to…, freecodecamp.org/news |
| `projects` | Projects | Repositorios de código (GitHub, GitLab, Codeberg) | Artículos que mencionan un repo | github.com/owner/repo |
| `webpages` | WebPages | Sitios interactivos: juegos, herramientas online, colecciones de assets | Artículos estáticos | uiverse.io, excalidraw.com, neal.fun |
| `ia` | IA | Noticias, artículos y análisis sobre IA/ML/LLMs | Repos de IA (→ `projects` + etiqueta `ia`) | openai.com/blog, huggingface.co/blog |
| `diseno` | Diseño | Artículos, guías, informes de diseño, UX/UI, tipografía, diseño web | Colecciones interactivas de assets (→ `webpages` + `diseno`) | smashingmagazine.com, nngroup.com |

**Orden de precedencia** cuando hay conflicto: `projects` > `articulos` > `tutoriales` > `webpages` > `ia` > `diseno`. Lo temático (`ia`, `diseno`) se añade como etiqueta si la principal es de "formato".

## Motor de reglas (`packages/core/src/categorize.ts`)

Determinista, sin red, ejecutado **en el cliente** (web y extensión) desde `@linkshelf/core`; no hay Cloud Functions. Las categorías son una constante fija de core (ver [modelo-de-datos.md](modelo-de-datos.md#categorías-configuración-fija-en-linkshelfcore)).

```ts
type Rule = {
  id: string;
  category?: CategorySlug;   // categoría propuesta
  tags?: string[];           // etiquetas propuestas
  weight: number;            // 0..1
  match: {
    hosts?: string[];        // coincidencia exacta o sufijo (".github.io")
    pathRegex?: RegExp;
    keywords?: string[];     // sobre título + descripción, sin acentos y en minúsculas
    ogType?: string[];
  };
};
```

### Algoritmo
1. Construir el contexto: `host`, `path`, `text = unaccent(lower(title + ' ' + description))`, `ogType`.
2. Evaluar todas las reglas; cada regla que coincide suma `weight` a su categoría y añade sus etiquetas.
3. Categoría = la de mayor puntaje; empates por orden de precedencia.
4. `confidence = min(1, puntaje)`. Si `< 0.4` → sugerir `users/{uid}.defaultCategory` (por defecto `webpages`) y marcar baja confianza en la UI.
5. Si la categoría ganadora es de formato (`projects`, `articulos`, `tutoriales`, `webpages`) y `ia` o `diseno` también puntuaron ≥ 0,4 → añadir esas como etiquetas.
6. Devolver `reasons[]` legibles para la UI ("github.com → Projects").

### Reglas iniciales

| ID | Coincidencia | Resultado | Peso |
|---|---|---|---|
| `host-github-repo` | host `github.com`, `gitlab.com`, `codeberg.org` con ruta `/owner/repo` | `projects` | 1,0 |
| `host-arxiv-doi` | `arxiv.org`, `doi.org`, `*.nature.com`, `science.org`, `pubmed.ncbi.nlm.nih.gov`, `researchgate.net`, `acm.org`, `ieee.org`, `biorxiv.org` | `articulos` | 1,0 |
| `path-pdf-paper` | ruta termina en `.pdf` y texto contiene `abstract` | `articulos` | 0,6 |
| `kw-tutorial` | `paso a paso`, `step by step`, `how to`, `como hacer`, `tutorial`, `guide to`, `getting started`, `build a`, `crea un` | `tutoriales` + tag `tutorial` | 0,6 |
| `host-tutorial` | `freecodecamp.org`, `css-tricks.com`, `web.dev/learn`, `egghead.io` | `tutoriales` | 0,5 |
| `host-ai` | `openai.com`, `anthropic.com`, `huggingface.co`, `deepmind.google`, `ai.meta.com`, `mistral.ai`, `x.ai` | `ia` | 0,8 |
| `kw-ai` | `llm`, `gpt`, `inteligencia artificial`, `machine learning`, `ai agent`, `agente`, `rag`, `transformer`, `diffusion`, `prompt` | `ia` + tag `ia` | 0,5 |
| `host-design` | `smashingmagazine.com`, `nngroup.com`, `uxdesign.cc`, `figma.com/blog`, `alistapart.com`, `fonts.google.com/knowledge` | `diseno` | 0,8 |
| `kw-design` | `ux`, `ui design`, `tipografia`, `typography`, `color palette`, `diseno`, `design system`, `accesibilidad` | `diseno` + tag `diseno` | 0,5 |
| `host-webpages` | `uiverse.io`, `neal.fun`, `codepen.io`, `itch.io`, `excalidraw.com`, `*.vercel.app`, `*.netlify.app`, `*.github.io` | `webpages` | 0,7 |
| `og-website` | `og:type = website` y sin `article:published_time` | `webpages` | 0,3 |
| `og-article` | `og:type = article` | (no cambia categoría; reduce `webpages` en 0,2) | — |

Las reglas viven en un archivo de datos versionado; añadir una regla requiere un test de ejemplo.

### Ejemplos

| URL / título | Puntajes | Sugerencia |
|---|---|---|
| `github.com/langchain-ai/langgraph` | projects 1,0; ia 0,5 | **Projects** + `ia` |
| `arxiv.org/abs/1706.03762` "Attention Is All You Need" | articulos 1,0; ia 0,5 | **Artículos** + `ia` |
| `dev.to/...` "How to build a RAG app step by step" | tutoriales 0,6; ia 0,5 | **Tutoriales** + `ia` |
| `uiverse.io/buttons` | webpages 0,7; diseno 0 | **WebPages** |
| `smashingmagazine.com/2026/10/design-systems` | diseno 1,3 | **Diseño** |
| `openai.com/index/...` | ia 0,8 | **IA** |
| `example.com/random` sin señales | — (confianza < 0,4) | default (`webpages`), baja confianza |

## Aprendizaje de correcciones (MVP+)
Cuando el usuario cambia la sugerida, el documento queda con `suggestedCategory` ≠ `category`. El cliente agrupa esas correcciones por `domain` sobre el listener en memoria; si un dominio acumula ≥ 3 correcciones a la misma categoría, se escribe `users/{uid}/domainRules/{domain}` = `{ category, corrections }` y core la aplica como regla personal con peso 0,9 (Fase 3). Las reglas personales se leen una vez por sesión (decenas de documentos).

## Sugerencia con LLM (Fase 4, opcional)
- Solo si `confidence < 0.6` y el usuario lo activa en ajustes.
- Proveedores con tier gratuito (p. ej. Google Gemini API free tier, Groq o Hugging Face Inference). Sin Cloud Functions no hay servidor donde guardar un secreto: el usuario pega **su propia** clave en *Opciones* de la extensión, se guarda solo en `chrome.storage.local` y la llamada sale desde la extensión. La web no usa LLM (la clave quedaría expuesta en el bundle).
- Prompt con lista cerrada de slugs y salida JSON `{ "category": "...", "tags": [...] }`, validada contra el enum; si falla o excede cuota → se queda la sugerencia por reglas.
- Se envían solo título, descripción y dominio (no el contenido completo) por privacidad y cuota.
