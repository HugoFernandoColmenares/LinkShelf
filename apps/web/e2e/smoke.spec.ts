import { expect, test } from '@playwright/test';

test('guarda un enlace limpio, filtra y avisa el duplicado', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo').fill('prueba@linkshelf.dev');
  await page.getByLabel('Contraseña').fill('linkshelf-prueba');
  await page.getByRole('button', { name: 'Entrar en local' }).click();
  await expect(page).toHaveURL(/\/links/);

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
});
