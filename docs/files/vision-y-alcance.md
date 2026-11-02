> **Proyecto:** LinkShelf

# Visión y alcance

## Visión
LinkShelf es la "bahía" única donde terminan todos los enlaces que vale la pena conservar: limpios, sin duplicados, bien categorizados y accesibles desde cualquier navegador o dispositivo.

## Problema
- Los enlaces del newsletter TLDR se guardan como favoritos del navegador: crecieron a cientos y quedaron atados a un solo navegador/perfil.
- Hay duplicados porque la misma página llega con URLs distintas: `utm_source=tldrnewsletter`, redirecciones de tracking de TLDR, `www.` vs sin `www`, `/` final, `#fragmentos`, `http` vs `https`, distintas rutas de un mismo repo de GitHub.
- Las carpetas actuales (Artículos, Tutoriales, Projects, WebPages, IA, Diseño) no permiten que un enlace pertenezca a dos grupos (un tutorial de IA).
- Buscar algo guardado es lento: no hay búsqueda por título/descripción ni filtros combinados.

## Objetivos
| # | Objetivo | Métrica |
|---|---|---|
| O1 | Guardar un enlace en ≤ 2 clics desde el navegador | Popup abre y guarda en < 3 s (p95) |
| O2 | Cero duplicados exactos | Restricción única `(user_id, normalized_url)` |
| O3 | Detectar duplicados cercanos antes de guardar | Aviso cuando similitud ≥ 0,6 |
| O4 | URLs sin tracking | 100 % de parámetros de la lista negra eliminados |
| O5 | Encontrar un enlace en < 10 s | Filtros + búsqueda por texto |
| O6 | Costo de operación $0 | Solo free tiers |
| O7 | Independencia del navegador | Chrome, Edge, Brave, Firefox + web |

## No objetivos
- No es una red social ni permite compartir colecciones públicas (al menos hasta fases posteriores).
- No archiva el contenido completo de las páginas (no es un "read-it-later" offline).
- No sincroniza bidireccionalmente con los favoritos nativos del navegador; la importación es unidireccional.
- No incluye app móvil nativa (la web es responsive).
- No usa servicios de pago ni LLMs de pago.
- Multiusuario soportado técnicamente (RLS), pero no se optimiza para equipos.

## Personas
- **Hugo (usuario principal):** desarrollador full-stack, lee TLDR a diario, abre artículos en pestañas y quiere guardarlos rápido sin pensar en la carpeta.

## Historias de usuario
| ID | Como… | quiero… | para… | Fase |
|---|---|---|---|---|
| HU-01 | usuario | guardar la pestaña actual desde el popup | no perder un artículo | MVP |
| HU-02 | usuario | guardar un enlace con clic derecho → *Guardar enlace* | guardar enlaces sin abrirlos | MVP |
| HU-03 | usuario | que la URL se limpie de `utm_*` y redirecciones de TLDR | tener URLs canónicas | MVP |
| HU-04 | usuario | ver un aviso de *posible duplicado* antes de guardar | decidir si lo guardo igual o lo fusiono | MVP |
| HU-05 | usuario | recibir una categoría sugerida | guardar sin pensar | MVP |
| HU-06 | usuario | asignar una categoría principal y etiquetas secundarias | clasificar enlaces mixtos | MVP |
| HU-07 | usuario | filtrar por categoría, etiqueta, dominio y fecha | encontrar rápido | MVP |
| HU-08 | usuario | buscar por título/descripción tolerando acentos y errores | encontrar sin recordar el título exacto | MVP |
| HU-09 | usuario | editar y eliminar enlaces | mantener la colección | MVP |
| HU-10 | usuario | iniciar sesión con magic link o GitHub | acceder desde cualquier dispositivo | MVP |
| HU-11 | usuario | importar mis favoritos de Chrome con dedupe masivo | migrar lo que ya tengo | Fase 2 |
| HU-12 | usuario | importar los enlaces de mis correos TLDR | no copiar a mano | Fase 3 |
| HU-13 | usuario | marcar leído/no leído y favorito | gestionar lo pendiente | Fase 3 |
| HU-14 | usuario | búsqueda full-text en español e inglés | búsquedas más potentes | Fase 4 |
| HU-15 | usuario | sugerencia de categoría por LLM gratuito | mejor precisión que las reglas | Fase 4 |

## MVP vs. posterior
**MVP (Fase 1):** HU-01 a HU-10. Paquete core, esquema BD con RLS, Edge Function `normalize-link`, web app (lista, filtros, edición, login) y extensión (popup + menú contextual).

**Posterior:** importaciones (Fases 2-3), leído/favorito (3), full-text, LLM y hash de contenido (4). Ver [roadmap.md](roadmap.md).

## Supuestos y riesgos
| Riesgo | Mitigación |
|---|---|
| Proyecto Supabase se pausa tras 7 días sin actividad | Uso diario + workflow de *keep-alive* semanal (ver [stack-y-servicios.md](stack-y-servicios.md)) |
| Sitios que bloquean el fetch de metadatos | Fallback: usar `document.title` enviado por la extensión |
| Cambios en el formato de tracking de TLDR | Lista de dominios de tracking configurable en `@linkshelf/core` + tests con ejemplos reales |
