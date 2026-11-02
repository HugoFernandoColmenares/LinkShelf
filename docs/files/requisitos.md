> **Proyecto:** LinkShelf

# Requisitos

## Requisitos funcionales

| ID    | Requisito                                                                                                     | Prioridad |
| ----- | ------------------------------------------------------------------------------------------------------------- | --------- |
| RF-01 | Autenticación con Google (Firebase Auth) en la web y en la extensión                                          | MVP       |
| RF-02 | Guardar enlace (URL, título, descripción, imagen, categoría, etiquetas, nota)                                 | MVP       |
| RF-03 | Normalizar la URL con el algoritmo de [normalizacion-y-duplicados.md](normalizacion-y-duplicados.md)          | MVP       |
| RF-04 | Eliminar parámetros de tracking (`utm_*`, `ref`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, TLDR…)                | MVP       |
| RF-05 | Resolver redirecciones (incluidas las de TLDR) y respetar `<link rel="canonical">`                            | MVP       |
| RF-06 | Extraer `title`, `description`, `og:image`, `og:site_name`                                                    | MVP       |
| RF-07 | Detectar duplicado exacto (`normalized_url`) y cercano (trigramas de título, mismo canónico)                  | MVP       |
| RF-08 | Mostrar aviso de posible duplicado con opciones: _Ver existente_, _Guardar igual_, _Cancelar_                 | MVP       |
| RF-09 | Sugerir categoría por reglas                                                                                  | MVP       |
| RF-10 | Una categoría principal obligatoria + N etiquetas                                                             | MVP       |
| RF-11 | Listado paginado con filtros combinables: categoría, etiquetas (AND/OR), dominio, rango de fechas, texto      | MVP       |
| RF-12 | Búsqueda difusa insensible a acentos (en el cliente: sin acentos + trigramas sobre `title`, `domain`, `tags`) | MVP       |
| RF-13 | Editar y eliminar (con confirmación)                                                                          | MVP       |
| RF-14 | Extensión: popup "guardar pestaña actual" y menú contextual _Guardar enlace_                                  | MVP       |
| RF-15 | Gestión de etiquetas (crear, renombrar, fusionar, borrar)                                                     | MVP       |
| RF-16 | Importar favoritos de Chrome (HTML Netscape o `chrome.bookmarks`) con informe de duplicados                   | Fase 2    |
| RF-17 | Importar enlaces de correos TLDR desde Gmail                                                                  | Fase 3    |
| RF-18 | Estado leído/no leído y favorito                                                                              | Fase 3    |
| RF-19 | Búsqueda de texto completo local (MiniSearch, stemming ES/EN)                                                 | Fase 4    |
| RF-20 | Sugerencia de categoría por LLM gratuito                                                                      | Fase 4    |
| RF-21 | Hash de contenido para duplicados con URL distinta                                                            | Fase 4    |
| RF-22 | Exportar colección a JSON y HTML de favoritos                                                                 | Fase 4    |

## Requisitos no funcionales

| ID     | Categoría      | Requisito                                                                                                                   |
| ------ | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| RNF-01 | Costo          | $0/mes: solo free tiers (Vercel Hobby, Firebase Spark sin tarjeta, GitHub Actions)                                          |
| RNF-02 | Rendimiento    | `normalize-link` p95 < 2,5 s (timeout de fetch 5 s); listado p95 < 500 ms con 10 000 enlaces                                |
| RNF-03 | Seguridad      | Firestore Security Rules por `uid` en todas las rutas; ninguna credencial de administración en clientes                     |
| RNF-04 | Privacidad     | Cada usuario solo ve sus datos; sin analítica de terceros                                                                   |
| RNF-05 | Accesibilidad  | WCAG 2.2 AA en la web y el popup                                                                                            |
| RNF-06 | Compatibilidad | Chrome/Edge/Brave ≥ últimas 2 versiones, Firefox ≥ 128; web en navegadores evergreen                                        |
| RNF-07 | Mantenibilidad | TypeScript strict; cobertura ≥ 90 % en `@linkshelf/core`                                                                    |
| RNF-08 | Idioma         | Interfaz en español (es-419); código e identificadores en inglés                                                            |
| RNF-09 | Portabilidad   | Reglas e índices de Firestore versionados; exportación JSON                                                                 |
| RNF-10 | Resiliencia    | Si no se pueden resolver redirecciones o metadatos, se guarda con la normalización local del core y `metaStatus: 'pending'` |
| RNF-11 | Capacidad      | Diseñado para ≤ 50 000 enlaces por usuario dentro de 500 MB                                                                 |

## Criterios de aceptación por caso de uso

### CU-01 Guardar pestaña actual (HU-01, HU-03, HU-05)

- **Dado** que estoy autenticado en la extensión **cuando** abro el popup en `https://www.example.com/post/?utm_source=tldrnewsletter#intro` **entonces** veo la URL `https://example.com/post`, el título y la categoría sugerida en < 3 s.
- **Cuando** pulso _Guardar_ **entonces** se crea el enlace y el popup muestra "Enlace guardado" con un link a la web.
- **Dado** que el sitio no responde en 5 s a la extensión **entonces** se usa la normalización local y el título de la pestaña, y se indica "Metadatos pendientes".

### CU-02 Menú contextual (HU-02)

- **Dado** un enlace en cualquier página (incluido Gmail) **cuando** hago clic derecho → _Guardar enlace_ **entonces** se normaliza y guarda con la categoría sugerida, y aparece una notificación del sistema con _Deshacer_ (10 s).
- Si es duplicado exacto, la notificación dice "Ya estaba guardado" y no se crea registro.

### CU-03 Aviso de duplicado (HU-04)

- **Dado** que existe `https://github.com/vercel/next.js` **cuando** guardo `https://github.com/vercel/next.js/tree/canary?ref=tldr` **entonces** se muestra "Ya guardaste este enlace" (exacto) con fecha y categoría existentes y el botón _Guardar_ se reemplaza por _Ver existente_.
- **Dado** un enlace con título similitud ≥ 0,6 y mismo dominio **entonces** se muestra "Posible duplicado" listando hasta 3 coincidencias con su puntaje, y _Guardar igual_ sigue disponible.
- Nunca se descarta un enlace silenciosamente.

### CU-04 Categorías y etiquetas (HU-06)

- No se puede guardar sin categoría principal (se preselecciona la sugerida o `WebPages` por defecto).
- Puedo añadir etiquetas existentes con autocompletado o crear nuevas (minúsculas, slug, máx. 32 caracteres, máx. 10 por enlace).

### CU-05 Filtrar y buscar (HU-07, HU-08)

- Los filtros se reflejan en la URL (`/links?cat=ia&tags=tutorial,llm&q=agentes`) y son compartibles/recargables.
- Buscar `diseno` encuentra "Diseño"; buscar `angluar` encuentra "Angular" (similitud trigram).
- Resultados paginados de 30 en 30 con scroll infinito.

### CU-06 Autenticación (HU-10)

- El login con Google se completa en < 10 s; la sesión de Firebase persiste (IndexedDB) y el ID token se renueva automáticamente cada hora.
- La extensión comparte la misma cuenta; cerrar sesión en la extensión no cierra la web.

### CU-07 Importar favoritos (HU-11, Fase 2)

- Subo el HTML exportado de Chrome o autorizo `bookmarks`; veo un resumen: _N nuevos, M duplicados exactos, K posibles duplicados_, con la carpeta original propuesta como categoría.
- Puedo revisar y confirmar por lotes; se registra un `import_batches` que puedo revertir.

### CU-08 Importar desde Gmail (HU-12, Fase 3)

- Selecciono un rango de fechas; se extraen los enlaces de correos de `dan@tldrnewsletter.com`, se resuelven las redirecciones y se muestran para confirmar.
