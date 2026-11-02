import { describe, expect, it } from 'vitest';
import { slugifyTag, suggestCategory } from '../src/index';

describe('suggestCategory', () => {
  it('clasifica un repo de GitHub con señal de IA', () => {
    const result = suggestCategory({ url: 'https://github.com/langchain-ai/langgraph' });
    expect(result.category).toBe('projects');
    expect(result.tags).toContain('ia');
    expect(result.confidence).toBe(1);
    expect(result.lowConfidence).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('Projects'))).toBe(true);
  });

  it('clasifica arXiv como artículo y suma IA si el texto lo dice', () => {
    const plain = suggestCategory({
      url: 'https://arxiv.org/abs/1706.03762',
      title: 'Attention Is All You Need',
    });
    expect(plain.category).toBe('articulos');
    expect(plain.tags).not.toContain('ia');

    const withSignal = suggestCategory({
      url: 'https://arxiv.org/abs/1706.03762',
      title: 'Attention Is All You Need',
      description: 'A transformer model',
    });
    expect(withSignal.category).toBe('articulos');
    expect(withSignal.tags).toContain('ia');
  });

  it('prioriza tutorial sobre IA cuando ambas puntúan', () => {
    const result = suggestCategory({
      url: 'https://dev.to/alguien/rag',
      title: 'How to build a RAG app step by step',
    });
    expect(result.category).toBe('tutoriales');
    expect(result.tags).toEqual(expect.arrayContaining(['tutorial', 'ia']));
    expect(result.confidence).toBeCloseTo(0.6);
  });

  it('reconoce WebPages, Diseño e IA por el host', () => {
    expect(suggestCategory({ url: 'https://uiverse.io/buttons' }).category).toBe('webpages');
    const design = suggestCategory({ url: 'https://smashingmagazine.com/2026/10/design-systems' });
    expect(design.category).toBe('diseno');
    expect(design.confidence).toBe(1);
    expect(suggestCategory({ url: 'https://openai.com/index/gpt' }).category).toBe('ia');
  });

  it('usa la categoría por defecto si no hay señales', () => {
    const result = suggestCategory({ url: 'https://example.com/random', title: 'Hola' });
    expect(result.category).toBe('webpages');
    expect(result.lowConfidence).toBe(true);
    expect(result.confidence).toBeLessThan(0.4);
  });

  it('cubre reglas de host, PDF y og:type', () => {
    expect(suggestCategory({ url: 'https://doi.org/10.1/abc' }).category).toBe('articulos');
    expect(suggestCategory({ url: 'https://freecodecamp.org/news/x' }).category).toBe('tutoriales');
    expect(suggestCategory({ url: 'https://web.dev/learn/css' }).category).toBe('tutoriales');
    expect(suggestCategory({ url: 'https://css-tricks.com/guia' }).category).toBe('tutoriales');
    expect(suggestCategory({ url: 'https://egghead.io/cursos' }).category).toBe('tutoriales');
    expect(suggestCategory({ url: 'https://anthropic.com/news' }).category).toBe('ia');
    expect(suggestCategory({ url: 'https://huggingface.co/blog/x' }).category).toBe('ia');
    expect(suggestCategory({ url: 'https://nngroup.com/articles/x' }).category).toBe('diseno');
    expect(suggestCategory({ url: 'https://figma.com/blog/sistemas' }).category).toBe('diseno');
    expect(suggestCategory({ url: 'https://fonts.google.com/knowledge/x' }).category).toBe(
      'diseno',
    );
    expect(suggestCategory({ url: 'https://neal.fun/juego' }).category).toBe('webpages');
    expect(suggestCategory({ url: 'https://codepen.io/pen' }).category).toBe('webpages');
    expect(suggestCategory({ url: 'https://mi-app.vercel.app/' }).category).toBe('webpages');
    expect(
      suggestCategory({
        url: 'https://example.com/paper.pdf',
        description: 'Abstract del estudio',
      }).category,
    ).toBe('articulos');
    const website = suggestCategory({ url: 'https://example.com/tool', ogType: 'website' });
    expect(website.lowConfidence).toBe(true);
    const article = suggestCategory({
      url: 'https://example.com/tool',
      ogType: 'article',
      articlePublishedTime: '2026-01-01',
    });
    expect(article.reasons.some((reason) => reason.includes('og:type article'))).toBe(true);
    expect(suggestCategory({ url: 'https://gitlab.com/grupo/repo' }).category).toBe('projects');
    expect(suggestCategory({ url: 'https://codeberg.org/grupo/repo' }).category).toBe('projects');
    expect(suggestCategory({ url: 'https://github.com/features' }).category).not.toBe('projects');
  });
});

describe('slugifyTag', () => {
  it('normaliza etiquetas', () => {
    expect(slugifyTag('  Diseño Web ')).toBe('diseno-web');
    expect(slugifyTag('***')).toBeNull();
  });
});
