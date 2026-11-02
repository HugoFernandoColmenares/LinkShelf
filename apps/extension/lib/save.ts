import {
  findNearDuplicates,
  prepareLink,
  resolveRedirects,
  type DuplicateCheck,
  type PreparedLink,
} from '@linkshelf/core';
import { DuplicateError, LinksRepo, type LinkChoice } from '@linkshelf/firebase';
import { auth, db } from './firebase';

const repo = new LinksRepo(db);

export interface Inspection {
  prepared: PreparedLink;
  duplicate: DuplicateCheck;
  signedIn: boolean;
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
  const user = auth.currentUser;
  if (!user) {
    return { prepared, signedIn: false, duplicate: { level: 'none', matches: [] } };
  }
  const existing = await repo.getById(user.uid, prepared.id);
  if (existing) {
    return {
      prepared,
      signedIn: true,
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
  return { prepared, signedIn: true, duplicate: near };
}

export async function commitLink(prepared: PreparedLink, choice: LinkChoice): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión para guardar.');
  try {
    await repo.create(user.uid, prepared, choice);
  } catch (error) {
    if (error instanceof DuplicateError) throw error;
    throw error;
  }
}

export async function removeLink(id: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await repo.remove(user.uid, id);
}
