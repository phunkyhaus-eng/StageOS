import { expect, test } from '@playwright/test';

test('dashboard shell renders core modules', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByText('StageOS')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Event Dossiers' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Booking CRM' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revenue Intelligence' })).toBeVisible();
});
