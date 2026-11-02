import { describe, expect, it } from 'vitest';
import {
  buildKeywords,
  duplicateCheck,
  findNearDuplicates,
  matchesQuery,
  titleSimilarity,
  type LinkSummary,
} from '../src/index';

const summary = (
  patch: Partial<LinkSummary> & Pick<LinkSummary, 'id' | 'title' | 'normalizedUrl'>,
): LinkSummary => ({
  domain: 'example.com',
  category: 'webpages',
  canonicalUrl: null,
  createdAt: null,
  ...patch,
});

describe('titleSimilarity', () => {
  it('es 1 para el mismo título normalizado y simétrica', () => {
    const left = 'How to build a RAG app step by step';
    const right = 'How to Build a RAG App, Step-by-Step | Medium';
    const score = titleSimilarity(left, right);
    expect(score).toBeGreaterThan(0.85);
    expect(titleSimilarity(right, left)).toBeCloseTo(score, 10);
    expect(titleSimilarity(left, left)).toBe(1);
  });

  it('deja temas distintos por debajo de 0,6', () => {
    expect(
      titleSimilarity('Attention is all you need', 'Attention in transformers explained'),
    ).toBeLessThan(0.6);
  });

  it('ignora títulos cortos o genéricos', () => {
    expect(titleSimilarity('Home', 'Home page of the site')).toBe(0);
    expect(titleSimilarity('GitHub', 'GitHub')).toBe(0);
  });
});

describe('buildKeywords', () => {
  it('quita stopwords y acentos y limita a 60', () => {
    const keywords = buildKeywords('Cómo construir un agente con TypeScript y más palabras extra');
    expect(keywords).toContain('construir');
    expect(keywords).toContain('agente');
    expect(keywords).not.toContain('como');
    expect(keywords.length).toBeLessThanOrEqual(60);
  });
});

describe('duplicados', () => {
  const existing = [
    summary({
      id: 'exact',
      title: 'Next.js',
      normalizedUrl: 'https://github.com/vercel/next.js',
      domain: 'github.com',
      category: 'projects',
    }),
    summary({
      id: 'near',
      title: 'Cómo construir un agente con TypeScript',
      normalizedUrl: 'https://blog.example.com/agente-ts',
      domain: 'example.com',
      category: 'tutoriales',
    }),
    summary({
      id: 'canon',
      title: 'Otra nota cualquiera distinta',
      normalizedUrl: 'https://blog.example.com/otra',
      domain: 'example.com',
      canonicalUrl: 'https://blog.example.com/canon',
      category: 'articulos',
    }),
    summary({
      id: 'path',
      title: 'Un titulo totalmente distinto sobre gatos',
      normalizedUrl: 'https://blog.example.com/misma?x=1',
      domain: 'example.com',
      category: 'webpages',
    }),
  ];

  it('marca exacto cuando el id coincide', () => {
    const result = duplicateCheck(
      {
        id: 'exact',
        title: 'Otra cosa',
        normalizedUrl: 'https://github.com/vercel/next.js',
        canonicalUrl: null,
        domain: 'github.com',
      },
      existing,
    );
    expect(result.level).toBe('exact');
    expect(result.matches[0]?.reason).toBe('same-id');
  });

  it('marca probable con títulos casi iguales en el mismo dominio', () => {
    const result = findNearDuplicates(
      {
        title: 'Cómo construir un agente con TypeScript paso a paso',
        normalizedUrl: 'https://blog.example.com/otro-agente',
        canonicalUrl: null,
        domain: 'example.com',
      },
      existing,
    );
    expect(result.level).toBe('probable');
    expect(result.matches[0]?.id).toBe('near');
    expect(result.matches[0]?.score).toBeGreaterThanOrEqual(0.8);
  });

  it('marca probable si el canónico coincide', () => {
    const result = findNearDuplicates(
      {
        title: 'Nada que ver con la nota guardada aqui',
        normalizedUrl: 'https://blog.example.com/nueva',
        canonicalUrl: 'https://blog.example.com/canon',
        domain: 'example.com',
      },
      existing,
    );
    expect(result.level).toBe('probable');
    expect(result.matches[0]?.reason).toBe('same-canonical');
    expect(result.matches[0]?.score).toBe(0.95);
  });

  it('marca posible cuando la ruta coincide y el título no', () => {
    const result = findNearDuplicates(
      {
        title: 'Receta de pan de masa madre casero',
        normalizedUrl: 'https://blog.example.com/misma',
        canonicalUrl: null,
        domain: 'example.com',
      },
      existing,
    );
    expect(result.level).toBe('possible');
    expect(result.matches.some((match) => match.id === 'path')).toBe(true);
  });

  it('no compara títulos parecidos de otro dominio', () => {
    const result = findNearDuplicates(
      {
        title: 'Cómo construir un agente con TypeScript',
        normalizedUrl: 'https://otro.test/agente',
        canonicalUrl: null,
        domain: 'otro.test',
      },
      existing,
    );
    expect(result.level).toBe('none');
  });
});

describe('matchesQuery', () => {
  const link = {
    title: 'Diseño de sistemas con Angular',
    domain: 'example.com',
    tags: ['diseno'],
    note: null,
    description: null,
  };

  it('ignora acentos y tolera un error de tipeo', () => {
    expect(matchesQuery(link, 'diseno')).toBe(true);
    expect(matchesQuery(link, 'angluar')).toBe(true);
    expect(matchesQuery(link, 'kubernetes')).toBe(false);
  });
});
