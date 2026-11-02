> **Proyecto:** LinkShelf

Capturas del MVP contra los emuladores de Firebase (no hay datos reales).

- `biblioteca.png`: biblioteca web con categorías, dominio y fechas.
- `guardar-duplicado.png`: aviso «Ya guardaste este enlace» y la URL ya limpia.
- `extension-popup.png`: popup de la extensión con un posible duplicado y *Guardar igual*.

Para regenerarlas, con los emuladores y `pnpm dev` en marcha: `xvfb-run -a node scripts/capture-screenshots.mjs`.
