> **Proyecto:** LinkShelf

# Seguridad

Sin backend propio, la seguridad descansa en tres piezas: **Firebase Auth** (identidad), **Firestore Security Rules** (autorización y validación de esquema) y el endurecimiento de los clientes (CSP, permisos mínimos de la extensión).

## Modelo de amenazas (resumen)
| Amenaza | Control |
|---|---|
| Un usuario lee/modifica enlaces de otro | Security Rules: solo `request.auth.uid == uid` accede a `users/{uid}/**` |
| Alguien usa la configuración pública de Firebase (API key) para leer/escribir | La API key no es un secreto; sin sesión válida las reglas niegan todo. API key restringida por API y referrer; App Check opcional |
| Cliente modificado escribe datos basura o gigantes | Validación de tipos, tamaños, enumeraciones y lista blanca de campos en las reglas |
| Cliente modificado rompe la invariante "ID = hash" | Las reglas exigen forma (`^[0-9a-f]{64}$`) e inmutabilidad de `normalizedUrl`; el hash exacto no puede verificarse en reglas (no hay SHA-256), pero un ID incorrecto solo afecta los datos del propio atacante |
| Agotar la cuota diaria de Spark (DoS) | Solo usuarios autenticados escriben; Auth limitado a Google; opcionalmente restringir el alta a una lista de correos en reglas; App Check con reCAPTCHA Enterprise en la web |
| XSS por títulos/descripciones de terceros | Angular escapa por defecto; prohibido `innerHTML`/`bypassSecurityTrust*`; CSP |
| Extensión con permisos excesivos | `activeTab`, sin content scripts; permisos de host amplios solo **opcionales** y pedidos en tiempo de ejecución |
| `fetch` de la extensión hacia la red local | Bloqueo de `localhost`, IPs privadas y `.local`; `credentials: 'omit'`; máx. 512 KB y 5 s |
| Robo de sesión | Sesión de Firebase en IndexedDB del origen (web) o de la extensión (aislado); ID token de 1 h con refresh token revocable desde la consola |
| Credenciales de despliegue filtradas | Cuenta de servicio con roles mínimos (`Firebase Rules Admin`, `Cloud Datastore Index Admin`) solo en GitHub Secrets |

## Firestore Security Rules

Archivo versionado en `firebase/firestore.rules`, desplegado por CI y probado con el emulador (ver [testing.md](testing.md)).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }

    // Opcional: limitar el proyecto a cuentas concretas
    // function allowed() { return request.auth.token.email in ['tu-correo@gmail.com'] && request.auth.token.email_verified; }

    function categories() { return ['articulos', 'tutoriales', 'projects', 'webpages', 'ia', 'diseno']; }
    function optString(v, max) { return v == null || (v is string && v.size() <= max); }

    function validLink(d) {
      return d.keys().hasOnly(['url', 'normalizedUrl', 'canonicalUrl', 'title', 'description', 'imageUrl',
                               'domain', 'category', 'suggestedCategory', 'tags', 'keywords', 'status',
                               'favorite', 'source', 'metaStatus', 'note', 'importBatchId', 'createdAt', 'updatedAt'])
        && d.keys().hasAll(['url', 'normalizedUrl', 'title', 'domain', 'category', 'tags', 'keywords',
                            'status', 'favorite', 'source', 'metaStatus', 'createdAt', 'updatedAt'])
        && d.url is string && d.url.size() <= 2048 && d.url.matches('^https?://.+')
        && d.normalizedUrl is string && d.normalizedUrl.size() <= 2048 && d.normalizedUrl.matches('^https?://.+')
        && optString(d.get('canonicalUrl', null), 2048)
        && d.title is string && d.title.size() > 0 && d.title.size() <= 500
        && optString(d.get('description', null), 1000)
        && optString(d.get('imageUrl', null), 2048)
        && optString(d.get('note', null), 2000)
        && d.domain is string && d.domain.size() <= 253
        && d.category in categories()
        && (d.get('suggestedCategory', null) == null || d.suggestedCategory in categories())
        && d.tags is list && d.tags.size() <= 10
        && d.keywords is list && d.keywords.size() <= 60
        && d.status in ['unread', 'read']
        && d.favorite is bool
        && d.source in ['tldr', 'manual', 'import']
        && d.metaStatus in ['ok', 'pending', 'failed']
        && d.updatedAt == request.time;
    }

    match /users/{uid} {
      allow read, delete: if isOwner(uid);
      allow create, update: if isOwner(uid)
        && request.resource.data.keys().hasOnly(['displayName', 'email', 'photoURL', 'defaultCategory', 'theme',
                                                 'similarityThresholds', 'normalizerVersion', 'createdAt', 'updatedAt']);

      match /links/{linkId} {
        allow read: if isOwner(uid);
        allow create: if isOwner(uid)
          && linkId.matches('^[0-9a-f]{64}$')
          && validLink(request.resource.data)
          && request.resource.data.createdAt == request.time;
        allow update: if isOwner(uid)
          && validLink(request.resource.data)
          && request.resource.data.diff(resource.data).unchangedKeys()
               .hasAll(['url', 'normalizedUrl', 'createdAt', 'source']);
        allow delete: if isOwner(uid);
      }

      match /importBatches/{batchId} { allow read, write: if isOwner(uid); }
      match /domainRules/{domain} {
        allow read, delete: if isOwner(uid);
        allow write: if isOwner(uid) && request.resource.data.category in categories();
      }
    }

    // Todo lo demás: denegado
    match /{document=**} { allow read, write: if false; }
  }
}
```

Notas:
- `create` solo se evalúa cuando el documento **no existe**; escribir sobre uno existente es `update`, donde `createdAt`/`normalizedUrl` deben quedar intactos. Junto con el ID determinista, esto impide duplicados exactos aun con clientes concurrentes.
- Las reglas **no** filtran: una consulta que pudiera devolver documentos ajenos se rechaza completa. Como todas las consultas van sobre `users/{uid}/links`, siempre cumplen.
- No se usan `get()`/`exists()` sobre otros documentos en las reglas: cada uno sería una lectura facturable.
- Firebase Console → *Firestore → Rules → Monitor* muestra solicitudes denegadas; revisar tras cada despliegue.

## Claves y configuración

| Valor | Dónde vive | ¿Público? |
|---|---|---|
| Config web de Firebase (`apiKey`, `authDomain`, `projectId`, `appId`) | Bundle de la web y de la extensión | **Sí**, por diseño. Identifica el proyecto; no da acceso a datos |
| Client ID OAuth de Google | Bundle de la extensión | Sí |
| Cuenta de servicio de despliegue (`FIREBASE_SERVICE_ACCOUNT`) | GitHub Actions secrets | **No** |
| `VERCEL_TOKEN` | GitHub Actions secrets | No |
| Clave de LLM (Fase 4, opcional) | `chrome.storage.local` del usuario, introducida por él | No; nunca en el repo ni en la web |

- **Restringir la API key** en Google Cloud Console: APIs permitidas (*Identity Toolkit API*, *Token Service API*, *Cloud Firestore API*) y, para la clave de la web, *HTTP referrers* `https://linkshelf.vercel.app/*` y `http://localhost:4200/*`. Para la extensión, usar una segunda API key sin restricción de referrer pero limitada a esas APIs.
- *Authorized domains* de Firebase Auth: solo `localhost`, el dominio de producción y los necesarios para previews.
- `.env` y `.env.*` en `.gitignore`; solo se versiona `.env.example` vacío.
- *GitHub secret scanning* + *push protection* activados.

## App Check (opcional)
- Web: `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })`.
- Extensión: sin proveedor oficial para MV3; si se activa *enforcement* en Firestore la extensión dejaría de funcionar, por eso se deja en modo **monitor** (métricas sin bloquear) o desactivado.
- Para un único usuario, las reglas + restricción de la API key son suficientes; App Check es defensa adicional frente a abuso de cuota.

## Content Security Policy

### Web (Vercel, `vercel.json` headers)
```
default-src 'self';
script-src 'self' https://apis.google.com https://www.gstatic.com;
style-src 'self' 'unsafe-inline';
img-src 'self' https: data:;
font-src 'self';
connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com;
frame-src https://<project-id>.firebaseapp.com https://accounts.google.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```
`frame-src` y `apis.google.com` los necesita `signInWithPopup` en la web. Más: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva. Las miniaturas `og:image` se cargan con `referrerpolicy="no-referrer"` y `loading="lazy"`.

### Extensión (MV3)
`content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'`. Sin código remoto ni `eval`; el SDK de Firebase se empaqueta con la build `firebase/auth/web-extension` (ver [extension-navegador.md](extension-navegador.md)).

## Resolución de URLs en la extensión
- Solo `http`/`https`, puertos 80/443.
- Rechazar `localhost`, `*.local`, IPs literales privadas (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`).
- `credentials: 'omit'`, `AbortSignal.timeout(5000)`, leer como máximo 512 KB y solo `text/html`.
- El HTML se parsea con `DOMParser` (o un parser de texto en el service worker) **sin** insertarlo en ningún DOM vivo.

## Dependencias y cadena de suministro
- `pnpm` con lockfile, `pnpm audit` en CI, Dependabot semanal.
- Acciones de GitHub fijadas por SHA o versión mayor de editores verificados.
- Permisos de `GITHUB_TOKEN` en `contents: read` por defecto.

## Privacidad
- Sin Google Analytics ni analítica de terceros (desactivado al crear el proyecto Firebase).
- Los datos son del usuario: exportación JSON y borrado de cuenta (borra `users/{uid}/**` desde el cliente y luego el usuario de Auth).
- Fase 3 (Gmail): scope `gmail.readonly`, procesamiento en el cliente sin almacenar correos; solo se guardan las URLs elegidas.
