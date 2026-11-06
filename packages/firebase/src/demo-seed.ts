import { prepareLink, type CategorySlug } from '@linkshelf/core';
import type { StoredLink } from './bundle';

interface SeedInput {
  url: string;
  title: string;
  description: string;
  category: CategorySlug;
  tags: string[];
  daysAgo: number;
}

const SEED: readonly SeedInput[] = [
  {
    url: 'https://arxiv.org/abs/1706.03762',
    title: 'Attention Is All You Need',
    description: 'El artículo que presentó la arquitectura Transformer.',
    category: 'articulos',
    tags: ['ia', 'transformers'],
    daysAgo: 12,
  },
  {
    url: 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/',
    title: 'Guía de Flexbox',
    description: 'Referencia visual para maquetar con CSS Flexbox.',
    category: 'tutoriales',
    tags: ['css'],
    daysAgo: 9,
  },
  {
    url: 'https://github.com/angular/angular',
    title: 'Angular',
    description: 'Repositorio del framework que usa esta aplicación.',
    category: 'projects',
    tags: ['typescript'],
    daysAgo: 7,
  },
  {
    url: 'https://uiverse.io/',
    title: 'Uiverse',
    description: 'Colección de componentes de interfaz listos para copiar.',
    category: 'webpages',
    tags: ['ui'],
    daysAgo: 5,
  },
  {
    url: 'https://huggingface.co/docs/transformers',
    title: 'Documentación de Transformers',
    description: 'Guías y API de la biblioteca de modelos de Hugging Face.',
    category: 'ia',
    tags: ['ml'],
    daysAgo: 3,
  },
  {
    url: 'https://www.nngroup.com/articles/ten-usability-heuristics/?utm_source=tldr&utm_medium=email',
    title: '10 heurísticas de usabilidad',
    description: 'Las heurísticas de Nielsen Norman Group, sin parámetros de rastreo.',
    category: 'diseno',
    tags: ['ux'],
    daysAgo: 1,
  },
];

export async function buildDemoLinks(now = Date.now()): Promise<StoredLink[]> {
  const links: StoredLink[] = [];
  for (const item of SEED) {
    const prepared = await prepareLink({
      url: item.url,
      title: item.title,
      description: item.description,
    });
    const createdAt = new Date(now - item.daysAgo * 86_400_000).toISOString();
    links.push({
      id: prepared.id,
      url: prepared.url,
      normalizedUrl: prepared.normalizedUrl,
      canonicalUrl: prepared.canonicalUrl,
      title: prepared.title,
      description: prepared.description,
      imageUrl: prepared.imageUrl,
      domain: prepared.domain,
      category: item.category,
      suggestedCategory: prepared.suggestion.category,
      tags: item.tags,
      keywords: prepared.keywords,
      status: 'unread',
      favorite: false,
      source: prepared.source,
      metaStatus: prepared.metaStatus,
      note: null,
      importBatchId: null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return links;
}
