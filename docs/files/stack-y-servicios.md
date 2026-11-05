> **Proyecto:** LinkShelf

# Stack y servicios

Objetivo de costo: **$0/mes, sin tarjeta de crédito registrada**. Toda la lógica de negocio vive en el cliente (paquete `@linkshelf/core`), y Firebase solo aporta identidad, base de datos y reglas de acceso.

## Stack elegido

| Capa              | Tecnología                                                                                             | Por qué                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app           | **Angular 22** (standalone, signals, zoneless), TypeScript strict                                      | Experiencia previa, tipado fuerte, SSR innecesario (app privada tras login)                                                                           |
| Extensión         | **WXT** (Vite) + Manifest V3 + TypeScript                                                              | Un solo código para Chrome, Edge, Brave y Firefox; HMR en desarrollo                                                                                  |
| Identidad         | **Firebase Authentication** con proveedor Google                                                       | Gratis e ilimitado para proveedores sociales en Spark; el usuario ya usa Gmail (fuente de TLDR)                                                       |
| Base de datos     | **Cloud Firestore (edición Standard)** en modo nativo                                                  | Documento por enlace, SDK con caché offline, Security Rules declarativas, plan Spark sin pausas                                                       |
| Autorización      | **Firestore Security Rules**                                                                           | Aíslan los datos por `uid` y validan esquema sin servidor propio                                                                                      |
| Lógica de dominio | **`@linkshelf/core`** (TypeScript puro, sin dependencias de DOM ni de Firebase)                        | Normalización, desenvolvedor de redirecciones TLDR, hash de ID, similitud de títulos, reglas de categoría; se ejecuta igual en web, extensión y tests |
| SDK               | **Firebase JS SDK v11+ modular** (`firebase/app`, `firebase/auth/web-extension`, `firebase/firestore`) | Tree-shaking; build específica para extensiones MV3                                                                                                   |
| Hosting web       | **Vercel Hobby** (alternativa: Firebase Hosting, también gratis en Spark)                              | Previews por PR y deploy desde GitHub sin configuración extra                                                                                         |
| Monorepo          | **pnpm workspaces**                                                                                    | Instalación rápida, `workspace:*` para `core`                                                                                                         |
| Testing           | **Vitest**, **Firebase Emulator Suite** + **`@firebase/rules-unit-testing`**, **Playwright**           | Ver [testing.md](testing.md)                                                                                                                          |
| CI/CD             | **GitHub Actions**                                                                                     | Gratis en repo público                                                                                                                                |

### Lo que **no** se usa y por qué

- **Cloud Functions / Cloud Run / Extensions de Firebase**: requieren plan **Blaze** (tarjeta). La resolución de redirecciones y metadatos se hace en la extensión (ver [normalizacion-y-duplicados.md](normalizacion-y-duplicados.md)).
- **Cloud Storage for Firebase**: desde 2024 los buckets nuevos exigen Blaze; no hace falta (las miniaturas son URLs `og:image` externas).
- **Firestore edición Enterprise / búsqueda vectorial / full-text nativo**: fuera del plan gratuito o inexistentes; la búsqueda se hace en el cliente.

## Plan Spark: cuotas y estimación de uso

Cuotas gratuitas diarias de Cloud Firestore (se reinician a medianoche hora del Pacífico) y mensuales:

| Recurso                       | Cuota Spark                                   | Uso estimado de LinkShelf                                                               | % de la cuota |
| ----------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- | ------------- |
| Almacenamiento                | 1 GiB                                         | 5 000 enlaces × ~2 KB (con keywords e índices) ≈ 10–15 MB                               | ~1,5 %        |
| Lecturas de documentos        | 50 000 / día                                  | Carga inicial ~3 000 docs una vez + caché persistente → 200–800 lecturas/día en régimen | ≤ 2 %         |
| Escrituras                    | 20 000 / día                                  | 10–50 enlaces guardados/editados al día                                                 | < 0,3 %       |
| Borrados                      | 20 000 / día                                  | Decenas                                                                                 | < 0,1 %       |
| Transferencia de red saliente | 10 GiB / mes                                  | < 50 MB/mes                                                                             | < 1 %         |
| Auth (Google)                 | Sin límite práctico para proveedores sociales | 1 usuario                                                                               | —             |

**Picos previstos:** la importación de favoritos de la Fase 2 (p. ej. 3 000 enlaces) cuesta ~3 000 escrituras + ~3 000 lecturas de verificación de duplicados: un solo día al 15 % de la cuota. Se hace en lotes (`writeBatch` de hasta 500 operaciones) y puede repartirse en varios días si se importan más de ~15 000.

**Qué pasa si se excede:** en Spark no hay cobro; Firestore responde `RESOURCE_EXHAUSTED` hasta el reinicio diario. La UI muestra "Cuota diaria agotada, intenta mañana" y la caché local sigue permitiendo leer.

### Mitigaciones para mantener las lecturas bajas

- **Persistencia offline** (`persistentLocalCache` + `persistentMultipleTabManager` en la web; caché en IndexedDB en el documento offscreen o popup de la extensión): las relecturas de documentos sin cambios salen de la caché.
- **Listener en tiempo real con `onSnapshot`** sobre la colección del usuario: tras la carga inicial solo se cobran los documentos que cambian.
- **Paginación** con `limit(50)` + `startAfter` en la lista, y filtros (`where('category','==',…)`) para no traer la colección completa en móvil.
- **Detección de duplicados acotada**: una `getDoc` por ID (1 lectura) + una consulta `where('domain','==',d)` limitada a 100 docs, normalmente servida desde caché.
- Nada de `count()` repetitivos: los contadores por categoría se calculan del listener en memoria.

### Diferencia clave con otros free tiers

- **No hay pausa por inactividad**: un proyecto Spark sin uso durante semanas sigue disponible; no hace falta workflow de _keep-alive_.
- Sin tarjeta, no hay riesgo de factura sorpresa: el peor caso es un corte temporal hasta el día siguiente.

### App Check (opcional)

Firebase App Check con **reCAPTCHA Enterprise** (gratis hasta 10 000 evaluaciones/mes) en la web reduce el abuso de la configuración pública. En extensiones MV3 no hay proveedor oficial; se puede usar un _custom provider_ o simplemente no aplicar _enforcement_ a Firestore. Para un proyecto personal es opcional: las Security Rules ya impiden acceso a datos ajenos.

## Alternativas consideradas

| Opción                                               | Decisión      | Motivo                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Firebase Spark (Firestore + Auth)**                | ✅ Elegida    | $0 sin tarjeta, sin pausas, SDK con caché offline, reglas declarativas suficientes para un modelo por usuario                                                                                                                          |
| **Supabase Free (Postgres + Auth + Edge Functions)** | ❌ Descartada | El plan gratuito permite solo **dos proyectos activos** y ambos ya están ocupados por otros proyectos del usuario; además los proyectos gratuitos se **pausan tras 7 días sin actividad**, lo que obligaba a un workflow de keep-alive |
| Firebase Blaze                                       | ❌            | Requiere tarjeta; solo se justificaría para Cloud Functions, que no son necesarias                                                                                                                                                     |
| Appwrite Cloud Free                                  | ❌            | Viable, pero menor madurez del SDK para extensiones MV3 y comunidad más pequeña                                                                                                                                                        |
| PocketBase autohospedado                             | ❌            | Requiere servidor siempre encendido (costo o mantenimiento)                                                                                                                                                                            |
| Turso / Neon + backend propio                        | ❌            | Obliga a escribir y hospedar una API y la autenticación                                                                                                                                                                                |
| `chrome.storage.sync` solamente                      | ❌            | Límite de ~100 KB y atado a la cuenta del navegador; no sirve como fuente de verdad multi-navegador                                                                                                                                    |

## Servicios a configurar

1. **Proyecto Firebase** en <https://console.firebase.google.com> (plan Spark por defecto; **no** vincular cuenta de facturación). Desactivar Google Analytics (no se usa).
2. **Firestore**: crear base `(default)` en modo producción, edición **Standard**, ubicación `nam5` (EE. UU. multirregión) o `southamerica-east1` (São Paulo) para menor latencia desde Colombia. La ubicación no se puede cambiar después.
3. **Authentication** → _Sign-in method_ → habilitar **Google**. En _Settings → Authorized domains_ confirmar `linkshelf-hugo.web.app` y `linkshelf-hugo.firebaseapp.com` (y el dominio propio si existe). Para previews ver [despliegue-y-ci.md](despliegue-y-ci.md).
4. **Google Cloud Console** (mismo proyecto) → _APIs y servicios → Credenciales_: el client ID OAuth web que crea Firebase; añadir `https://<extension-id>.chromiumapp.org/` como _URI de redireccionamiento autorizado_ para la extensión (ver [extension-navegador.md](extension-navegador.md)).
5. **App web** registrada en _Project settings → Your apps_ → copiar la config a `.env` (ver `.env.example`).
6. **Firebase CLI** (`pnpm add -D firebase-tools`): `firebase login`, `firebase use --add`, y despliegue de `firestore.rules` y `firestore.indexes.json`.
7. **Restringir la API key** en Google Cloud Console: limitar a las APIs _Identity Toolkit_, _Token Service_ y _Cloud Firestore_ y, para la web, a los _HTTP referrers_ del dominio.
8. **Vercel**: importar el repo, raíz `apps/web`, variables `FIREBASE_*` (ver `.env.example`). El proyecto real es `linkshelf-hugo` (`authDomain` `linkshelf-hugo.firebaseapp.com`, Firestore en `nam5`). No hace falta `FIREBASE_STORAGE_BUCKET` para el MVP: no hay Cloud Storage.
9. **Alertas**: Firebase Console → _Usage and billing_ para revisar el consumo diario (en Spark no hay alertas de presupuesto; se revisa manualmente una vez al mes).
