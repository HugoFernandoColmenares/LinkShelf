> **Proyecto:** LinkShelf

# Seguridad

## Modelo de amenazas (resumen)
| Amenaza | Control |
|---|---|
| Un usuario lee/modifica enlaces de otro | RLS en todas las tablas por `auth.uid()` |
| Filtración de la `service_role` key | Nunca en clientes; solo secrets de CI/Supabase |
| SSRF vía `normalize-link` (pedir URLs internas) | Bloqueo de IPs privadas/loopback/link-local/metadata, solo puertos 80/443, límite de redirecciones y tamaño |
| XSS por títulos/descripciones de terceros | Angular escapa por defecto; prohibido `innerHTML`/`bypassSecurityTrust*`; CSP |
| Extensión con permisos excesivos | `activeTab`, sin content scripts ni `<all_urls>`, `bookmarks` opcional |
| Abuso de cuota de la Edge Function | JWT obligatorio + límite 60 req/min por usuario |
| Robo de sesión | Tokens en `chrome.storage.local` (aislado por extensión) / `localStorage` de la web; PKCE; expiración corta del access token (1 h) |

## Row Level Security
- Activada en **todas** las tablas (`profiles`, `categories`, `links`, `tags`, `link_tags`, `import_batches`). Políticas en [modelo-de-datos.md](modelo-de-datos.md#políticas-rls).
- El rol `anon` no tiene políticas → sin sesión no hay datos.
- RPCs con `security invoker` (heredan RLS). Las únicas `security definer` (`handle_new_user`) fijan `search_path`.
- Tests de RLS con dos usuarios en la BD local (ver [testing.md](testing.md)).
- Revisar el *Security Advisor* de Supabase tras cada migración.

## Claves y secretos

| Clave | Dónde vive | ¿Pública? |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` (o *publishable key*) | Web (build), extensión (build) | Sí: segura gracias a RLS |
| `SUPABASE_SERVICE_ROLE_KEY` (o *secret key*) | Solo secrets de Supabase/CI si un script de mantenimiento lo requiere | **No**. Ignora RLS |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | GitHub Actions secrets | No |
| `VERCEL_TOKEN` | GitHub Actions secrets | No |
| `LLM_API_KEY` (Fase 4) | `supabase secrets set` | No |

- `.env` y `.env.*` en `.gitignore`; solo se versiona `.env.example` con valores vacíos.
- Escaneo de secretos: *GitHub secret scanning* + *push protection* activados en el repo.
- La Edge Function usa el JWT del usuario para consultar (cliente creado con el header `Authorization` entrante), no la service role.

## Content Security Policy

### Web (Vercel, `vercel.json` headers)
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' https: data:;
font-src 'self';
connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```
Más: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva.
`img-src https:` es necesario para miniaturas `og:image`; se cargan con `referrerpolicy="no-referrer"` y `loading="lazy"`.

### Extensión (MV3)
`content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'; connect-src https://<ref>.supabase.co`. MV3 ya prohíbe código remoto y `eval`.

## Edge Function `normalize-link`
- `verify_jwt = true`.
- Validación de entrada con esquema (zod) y longitud máx. de URL 2048.
- Resolución DNS previa y bloqueo de rangos: `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`; revalidar en cada redirección.
- Descargar máx. 512 KB, solo `text/html`; timeout 5 s.
- CORS con lista explícita de orígenes.
- Logs sin tokens ni URLs completas con query (se loguea el dominio).

## Dependencias y cadena de suministro
- `pnpm` con lockfile, `pnpm audit` en CI, Dependabot semanal.
- Acciones de GitHub fijadas por SHA o versión mayor de editores verificados.
- Permisos de `GITHUB_TOKEN` en `contents: read` por defecto.

## Privacidad
- Sin analítica de terceros. Los datos son del usuario: exportación JSON y borrado de cuenta (`on delete cascade`).
- Fase 3 (Gmail): scope `gmail.readonly`, procesamiento en el cliente o en la función sin almacenar correos; solo se guardan las URLs elegidas.
