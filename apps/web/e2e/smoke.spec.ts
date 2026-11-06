import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('guarda un enlace limpio, filtra y avisa el duplicado', async ({ page }) => {
  await page.goto('/links');
  await expect(page.getByText('Modo demo')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Attention Is All You Need' })).toBeVisible();

  await page.getByRole('link', { name: '+ Guardar' }).click();
  await page
    .getByLabel('URL')
    .fill('https://www.example.com/post/?utm_source=tldrnewsletter&utm_medium=email');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByText('https://example.com/post')).toBeVisible();
  await expect(page.getByText(/parámetros de rastreo/)).toBeVisible();
  await page.getByLabel('Título').fill('Una guía de prueba');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Enlace guardado')).toBeVisible();
  await page.getByRole('link', { name: 'Ver en la biblioteca' }).click();
  await expect(page.getByRole('link', { name: 'Una guía de prueba' })).toBeVisible();

  await page.getByRole('button', { name: /Artículos/ }).click();
  await expect(page.getByRole('link', { name: 'Una guía de prueba' })).toHaveCount(0);
  await page.getByRole('button', { name: /Todas/ }).click();
  await expect(page.getByRole('link', { name: 'Una guía de prueba' })).toBeVisible();

  await page.getByRole('link', { name: 'Una guía de prueba' }).click();
  await page.getByLabel('Título').fill('Una guía editada');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados')).toBeVisible();

  await page.getByRole('link', { name: '+ Guardar' }).click();
  await page.getByLabel('URL').fill('https://example.com/post?utm_campaign=otra');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByText('Ya guardaste este enlace')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver existente' })).toBeVisible();

  await page.getByRole('link', { name: 'Importar' }).click();
  await page.setInputFiles('#bookmark-file', {
    name: 'favoritos.html',
    mimeType: 'text/html',
    buffer: Buffer.from(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><H3>Tutoriales</H3>
        <DL><p>
          <DT><A HREF="https://example.com/post?utm_source=newsletter">Repetido</A>
          <DT><A HREF="https://dev.to/guia?utm_medium=email">Guía nueva</A>
        </DL><p>
      </DL>`),
  });
  await expect(page.getByText('Duplicado exacto')).toBeVisible();
  await expect(page.getByText('https://dev.to/guia')).toBeVisible();
  await page.getByRole('button', { name: 'Importar nuevos' }).click();
  await expect(page.getByText(/1 nuevos/)).toBeVisible();

  await page.getByLabel('Buscar enlaces').fill('Guía nueva');
  await expect(page.getByRole('link', { name: 'Guía nueva' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Una guía editada' })).toHaveCount(0);

  const normalized = 'https://example.com/importado-json';
  const id = createHash('sha256').update(normalized).digest('hex');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('linkshelf');
  await page.getByLabel('Importar JSON').setInputFiles({
    name: 'links.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'linkshelf-links',
        version: 1,
        exportedAt: new Date().toISOString(),
        links: [
          {
            id,
            url: normalized,
            normalizedUrl: normalized,
            canonicalUrl: null,
            title: 'Enlace importado',
            description: null,
            imageUrl: null,
            domain: 'example.com',
            category: 'webpages',
            suggestedCategory: null,
            tags: [],
            keywords: [],
            status: 'unread',
            favorite: false,
            source: 'manual',
            metaStatus: 'pending',
            note: null,
            importBatchId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    ),
  });
  await expect(page.getByText(/1 nuevos/)).toBeVisible();
  await page.getByLabel('Buscar enlaces').fill('Enlace importado');
  await expect(page.getByRole('link', { name: 'Enlace importado' })).toBeVisible();
});

test('una cuenta fuera de la lista vuelve al demo', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo').fill('visitante@linkshelf.dev');
  await page.getByLabel('Contraseña').fill('linkshelf-prueba');
  await page.getByRole('button', { name: 'Entrar en local' }).click();
  await expect(page.getByRole('alert')).toContainText('instancia privada');
  await page.getByRole('link', { name: 'Continuar sin cuenta' }).click();
  await expect(page).toHaveURL(/\/links/);
  await expect(page.getByText('Modo demo')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('instancia privada');
  await expect(page.getByRole('link', { name: 'Attention Is All You Need' })).toBeVisible();
});
