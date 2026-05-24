import { test, expect } from '@playwright/test';

test.describe('Tree structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-ost-card]', { timeout: 10_000 });
  });

  test('add child opportunity to outcome', async ({ page }) => {
    const before = await page.locator('[data-ost-card]').count();
    // The add-opportunity button sits below each outcome's children
    await page.getByTestId('add-opportunity-button').first().click();
    const after = await page.locator('[data-ost-card]').count();
    expect(after).toBe(before + 1);
    // Should enter edit mode on the new card
    await expect(page.getByTestId('card-title-input')).toBeVisible();
  });

  test('add child solution to opportunity', async ({ page }) => {
    const before = await page.locator('[data-ost-card]').count();
    await page.getByTestId('add-solution-button').first().click();
    const after = await page.locator('[data-ost-card]').count();
    expect(after).toBe(before + 1);
  });

  test('add child experiment to solution', async ({ page }) => {
    const before = await page.locator('[data-ost-card]').count();
    await page.getByTestId('add-experiment-button').first().click();
    const after = await page.locator('[data-ost-card]').count();
    expect(after).toBe(before + 1);
  });

  test('collapse hides children and shows count', async ({ page }) => {
    // Find the first collapse button (on the first outcome which has children)
    const collapseButton = page.locator('[data-testid^="collapse-"]').first();
    await expect(collapseButton).toBeVisible();

    const beforeCount = await page.locator('[data-ost-card]').count();

    // Collapse
    await collapseButton.click();

    const afterCount = await page.locator('[data-ost-card]').count();
    expect(afterCount).toBeLessThan(beforeCount);

    // Collapse button should show a number (child count)
    const buttonText = await collapseButton.textContent();
    expect(Number(buttonText?.trim())).toBeGreaterThan(0);
  });

  test('expand restores children', async ({ page }) => {
    const collapseButton = page.locator('[data-testid^="collapse-"]').first();
    const beforeCount = await page.locator('[data-ost-card]').count();

    // Collapse then expand
    await collapseButton.click();
    const collapsedCount = await page.locator('[data-ost-card]').count();
    expect(collapsedCount).toBeLessThan(beforeCount);

    await collapseButton.click();
    const expandedCount = await page.locator('[data-ost-card]').count();
    expect(expandedCount).toBe(beforeCount);
  });

  test('deleting a parent removes all descendants', async ({ page }) => {
    const before = await page.locator('[data-ost-card]').count();
    // Delete the first outcome (which has children)
    await page.getByTestId('card-menu-trigger').first().click();
    await page.getByTestId('menu-delete').click();
    const after = await page.locator('[data-ost-card]').count();
    // Should remove outcome + all its children (at least 3 levels deep)
    expect(before - after).toBeGreaterThanOrEqual(2);
  });
});
