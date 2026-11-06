import {
  findNearDuplicates,
  prepareLink,
  resolveRedirects,
  type DuplicateCheck,
  type PreparedLink,
} from '@linkshelf/core';
import { DuplicateError, LinksRepo, type LinkChoice } from '@linkshelf/firebase/personal';
import { PRIVATE_INSTANCE_MESSAGE, personalUser } from './access';
import { auth, db } from './firebase';

const repo = new LinksRepo(db);

export type ShelfAccess = 'anonymous' | 'personal' | 'denied';

export interface Inspection {
  prepared: PreparedLink;
  duplicate: DuplicateCheck;
  access: ShelfAccess;
}

async function hasHostPermission(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: ['https://*/*', 'http://*/*'] });
  } catch {
    return false;
  }
}

export async function inspectLink(input: {
  url: string;
  title?: string;
  html?: string;
}): Promise<Inspection> {
  let html = input.html;
  let url = input.url;
  if (!html && (await hasHostPermission())) {
    try {
      const resolved = await resolveRedirects(url);
      url = resolved.finalUrl;
      html = resolved.html;
    } catch {
      html = undefined;
    }
  }
  const prepared = await prepareLink({
    url,
    ...(input.title ? { title: input.title } : {}),
    ...(html ? { html } : {}),
  });
  const signedIn = auth.currentUser;
  const user = personalUser(signedIn);
  if (!signedIn) {
    return { prepared, access: 'anonymous', duplicate: { level: 'none', matches: [] } };
  }
  if (!user) {
    return { prepared, access: 'denied', duplicate: { level: 'none', matches: [] } };
  }
  const existing = await repo.getById(user.uid, prepared.id);
  if (existing) {
    return {
      prepared,
      access: 'personal',
      duplicate: {
        level: 'exact',
        matches: [
          {
            id: existing.id,
            title: existing.title,
            domain: existing.domain,
            category: existing.category,
            createdAt: existing.createdAt,
            score: 1,
            reason: 'same-id',
          },
        ],
      },
    };
  }
  const candidates = await repo.listByDomain(user.uid, prepared.domain);
  const near = findNearDuplicates(
    {
      id: prepared.id,
      title: prepared.title,
      normalizedUrl: prepared.normalizedUrl,
      canonicalUrl: prepared.canonicalUrl,
      domain: prepared.domain,
    },
    candidates,
  );
  return { prepared, access: 'personal', duplicate: near };
}

export async function commitLink(prepared: PreparedLink, choice: LinkChoice): Promise<void> {
  if (auth.currentUser && !personalUser()) throw new Error(PRIVATE_INSTANCE_MESSAGE);
  const user = personalUser();
  if (!user) throw new Error('Inicia sesión para guardar.');
  try {
    await repo.create(user.uid, prepared, choice);
  } catch (error) {
    if (error instanceof DuplicateError) throw error;
    throw error;
  }
}

export async function removeLink(id: string): Promise<void> {
  const user = personalUser();
  if (!user) return;
  await repo.remove(user.uid, id);
}
