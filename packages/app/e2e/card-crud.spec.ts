import { test, expect } from '@playwright/test';

test.describe('Card CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-ost-card]', { timeout: 10_000 });
  });

  test('add a new outcome via root add button', async ({ page }) => {
    const before = await page.locator('[data-ost-card]').count();
    await page.getByTestId('add-outcome-button').first().click();
    const after = await page.locator('[data-ost-card]').count();
    expect(after).toBe(before + 1);
    // New card should be in edit mode
    await expect(page.getByTestId('card-title-input')).toBeVisible();
  });

  test('edit title via card menu', async ({ page }) => {
    await page.getByTestId('card-menu-trigger').first().click();
    await page.getByTestId('menu-edit-title').click();
    const input = page.getByTestId('card-title-input');
    await expect(input).toBeVisible();
    await input.fill('Renamed Outcome');
    await input.press('Enter');
    await expect(page.getByTestId('card-title-input')).not.toBeVisible();
    await expect(page.locator('[data-ost-card]').first()).toContainText('Renamed Outcome');
  });

  test('edit title via double-click', async ({ page }) => {
    const firstCardTitle = page.locator('[data-ost-card] p').first();
    await firstCardTitle.dblclick();
    const input = page.getByTestId('card-title-input');
    await expect(input).toBeVisible();
    await input.fill('Double-click Edit');
    await input.press('Enter');
    await expect(page.locator('[data-ost-card]').first()).toContainText('Double-click Edit');
  });

  test('escape cancels title edit', async ({ page }) => {
    const firstCard = page.locator('[data-ost-card]').first();
    const originalText = await firstCard.locator('p').first().textContent();
    await page.getByTestId('card-menu-trigger').first().click();
    await page.getByTestId('menu-edit-title').click();
    const input = page.getByTestId('card-title-input');
    await input.fill('Should be cancelled');
    await input.press('Escape');
    await expect(firstCard).toContainText(originalText!);
  });

  test('delete card via menu', async ({ page }) => {
    const before = await page.locator('[data-ost-card]').count();
    // Delete the first card (an outcome with children — cascading delete)
    await page.getByTestId('card-menu-trigger').first().click();
    await page.getByTestId('menu-delete').click();
    const after = await page.locator('[data-ost-card]').count();
    expect(after).toBeLessThan(before);
  });

  test('delete card via sidebar', async ({ page }) => {
    const before = await page.locator('[data-ost-card]').count();
    // Click a card to open sidebar
    await page.locator('[data-ost-card]').first().click();
    await page.waitForSelector('aside', { timeout: 5_000 });
    // Click the delete button in sidebar footer
    await page.locator('aside button:has-text("Delete Card")').click();
    const after = await page.locator('[data-ost-card]').count();
    expect(after).toBeLessThan(before);
    // Sidebar should close
    await expect(page.locator('aside')).not.toBeVisible();
  });

  test('sidebar shows selected card details', async ({ page }) => {
    await page.locator('[data-ost-card]').first().click();
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    // Should show title input
    await expect(sidebar.locator('#title')).toBeVisible();
    // Should show description textarea
    await expect(sidebar.locator('#description')).toBeVisible();
    // Should show status selector
    await expect(page.getByTestId('sidebar-status-trigger')).toBeVisible();
    // Close sidebar
    await sidebar.locator('button').first().click();
    await expect(sidebar).not.toBeVisible();
  });

  test('edit title in sidebar updates card', async ({ page }) => {
    await page.locator('[data-ost-card]').first().click();
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    const titleInput = sidebar.locator('#title');
    await titleInput.fill('Sidebar Edit Title');
    // Click elsewhere to trigger update
    await sidebar.locator('#description').click();
    await expect(page.locator('[data-ost-card]').first()).toContainText('Sidebar Edit Title');
  });
});
