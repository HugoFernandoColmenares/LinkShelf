import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { repoRoot, resolveFirebaseEnv } from './firebase-env.mjs';

const env = resolveFirebaseEnv();
const body = `// Generado por scripts/write-env.mjs. No editar a mano y no commitear.
export const environment = ${JSON.stringify(
  {
    useEmulators: env.useEmulators,
    firebase: env.firebase,
    siteUrl: env.siteUrl,
    authEmulatorUrl: env.authEmulatorUrl,
    firestoreEmulatorHost: env.firestoreEmulatorHost,
    firestoreEmulatorPort: env.firestoreEmulatorPort,
  },
  null,
  2,
)} as const;
`;

const target = resolve(repoRoot, 'apps/web/src/environments/environment.ts');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, body);
console.log(
  `environment.ts (${env.useEmulators ? 'emuladores demo-linkshelf' : `proyecto ${env.firebase.projectId}`})`,
);
