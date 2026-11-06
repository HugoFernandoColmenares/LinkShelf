import { prepareLink } from '@linkshelf/core';
import { describe, expect, it } from 'vitest';
import { DEMO_OWNER_ID, DEMO_STORAGE_KEY, LocalLinkRepository } from '../src/local-repo';
import { MemoryStorage } from '../src/memory-storage';

async function sample() {
  return prepareLink({
    url: 'https://www.example.com/post/?utm_source=tldr&utm_medium=email',
    title: 'Una guía de prueba',
  });
}

describe('LocalLinkRepository', () => {
  it('siembra una vez, limpia el rastreo y no vuelve a sembrar', async () => {
    const storage = new MemoryStorage();
    const repo = new LocalLinkRepository(storage);
    const first = await repo.listAll(DEMO_OWNER_ID);
    expect(first.length).toBe(6);
    const design = first.find((link) => link.title === '10 heurísticas de usabilidad');
    expect(design?.normalizedUrl).toBe('https://nngroup.com/articles/ten-usability-heuristics');
    expect(design?.url).toContain('utm_source=tldr');
    expect(new Set(first.map((link) => link.category)).size).toBe(6);

    await repo.remove(DEMO_OWNER_ID, first[0]?.id ?? '');
    const again = new LocalLinkRepository(storage);
    const second = await again.listAll(DEMO_OWNER_ID);
    expect(second).toHaveLength(5);

    storage.removeItem(DEMO_STORAGE_KEY);
    const reseeded = await new LocalLinkRepository(storage).listAll(DEMO_OWNER_ID);
    expect(reseeded).toHaveLength(6);
  });

  it('guarda, deduplica, actualiza, busca por dominio y exporta', async () => {
    const repo = new LocalLinkRepository(new MemoryStorage());
    const prepared = await sample();
    const seen: string[] = [];
    const stop = repo.watch(DEMO_OWNER_ID, (links) => {
      seen.push(links.map((link) => link.title).join('|'));
    });
    await repo.create(DEMO_OWNER_ID, prepared, {
      category: 'tutoriales',
      tags: ['prueba'],
      note: 'nota',
    });
    await expect(
      repo.create(DEMO_OWNER_ID, prepared, { category: 'tutoriales', tags: [] }),
    ).rejects.toThrow(/Ya guardaste este enlace/);
    const saved = await repo.getById(DEMO_OWNER_ID, prepared.id);
    expect(saved?.normalizedUrl).toBe('https://example.com/post');
    expect(saved?.tags).toEqual(['prueba']);
    await repo.update(DEMO_OWNER_ID, prepared.id, { title: 'Título editado', status: 'read' });
    const byDomain = await repo.listByDomain(DEMO_OWNER_ID, 'example.com');
    expect(byDomain[0]?.title).toBe('Título editado');
    expect(byDomain[0]?.status).toBe('read');

    const bundle = await repo.exportBundle(DEMO_OWNER_ID);
    expect(bundle.format).toBe('linkshelf-links');
    expect(bundle.links.some((link) => link.id === prepared.id)).toBe(true);
    const imported = await repo.importBundle(DEMO_OWNER_ID, {
      ...bundle,
      links: [
        ...bundle.links.filter((link) => link.id !== prepared.id),
        {
          ...bundle.links.find((link) => link.id === prepared.id),
          title: 'Desde JSON',
          favorite: true,
        },
        {
          ...bundle.links[0],
          id: 'a'.repeat(64),
          title: 'Id falso',
        },
      ],
    });
    expect(imported.updated).toBeGreaterThanOrEqual(1);
    expect(imported.skipped).toBeGreaterThanOrEqual(1);
    expect((await repo.getById(DEMO_OWNER_ID, prepared.id))?.title).toBe('Desde JSON');
    expect((await repo.getById(DEMO_OWNER_ID, prepared.id))?.favorite).toBe(true);
    await repo.remove(DEMO_OWNER_ID, prepared.id);
    expect(await repo.getById(DEMO_OWNER_ID, prepared.id)).toBeNull();
    stop();
    const before = seen.length;
    await repo.create(
      DEMO_OWNER_ID,
      await prepareLink({ url: 'https://example.com/otro', title: 'Otro' }),
      { category: 'webpages', tags: [] },
    );
    expect(seen.length).toBe(before);
  });

  it('rechaza un JSON que no es de LinkShelf', async () => {
    const repo = new LocalLinkRepository(new MemoryStorage());
    await expect(
      repo.importBundle(DEMO_OWNER_ID, { format: 'otro', version: 1, links: [] }),
    ).rejects.toThrow(/JSON de LinkShelf/);
  });
});
