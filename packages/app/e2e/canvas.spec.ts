/**
 * Canvas guard tests — cover the interactions that have repeatedly regressed.
 * Run against the production preview build: `npm run build && npm test:e2e`
 *
 * Each test is a regression guard for a specific bug we've already fixed:
 *   1. App loads with cards (seeded Mozilla OST)
 *   2. Zoom out button works (broke when pan capture intercepted button clicks)
 *   3. Zoom in button works (same)
 *   4. Card three-dot menu opens (broke when dnd-kit intercepted pointer on buttons)
 *   5. Middle-click drag pans the canvas
 *   6. Left-click drag on canvas background pans
 *   7. Left-click drag on a card does NOT pan (dnd-kit should handle it)
 *   8. Sidebar status dropdown opens and saves (z-index fix guard)
 */

import { test, expect } from '@playwright/test';

test.describe('Canvas interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Mozilla OST is seeded on load — wait for at least one card
    await page.waitForSelector('[data-ost-card]', { timeout: 10_000 });
  });

  // ── 1. Load ──────────────────────────────────────────────────────────────
  test('app loads with cards visible', async ({ page }) => {
    await expect(page.locator('[data-ost-card]').first()).toBeVisible();
  });

  // ── 2 & 3. Zoom controls ─────────────────────────────────────────────────
  test('zoom out decreases zoom level', async ({ page }) => {
    const display = page.getByTestId('zoom-level');
    const before = parseInt((await display.textContent()) ?? '100');
    await page.getByTestId('zoom-out').click();
    const after = parseInt((await display.textContent()) ?? '100');
    expect(after).toBeLessThan(before);
  });

  test('zoom in increases zoom level', async ({ page }) => {
    const display = page.getByTestId('zoom-level');
    const before = parseInt((await display.textContent()) ?? '100');
    await page.getByTestId('zoom-in').click();
    const after = parseInt((await display.textContent()) ?? '100');
    expect(after).toBeGreaterThan(before);
  });

  // ── 4. Card dropdown ─────────────────────────────────────────────────────
  test('card three-dot menu opens', async ({ page }) => {
    // dnd-kit must not intercept the pointer on the menu button
    await page.getByTestId('card-menu-trigger').first().click();
    await expect(page.getByRole('menuitem', { name: 'Edit title' })).toBeVisible();
  });

  // ── 5. Middle-click pan ──────────────────────────────────────────────────
  test('middle-click drag pans the canvas', async ({ page }) => {
    const canvas = page.locator('[data-ost-export]');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const content = page.locator('[data-ost-export-content]');
    const before = await content.evaluate((el) => (el as HTMLElement).style.transform);

    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx + 120, cy + 80, { steps: 5 });
    await page.mouse.up({ button: 'middle' });

    const after = await content.evaluate((el) => (el as HTMLElement).style.transform);
    expect(after).not.toBe(before);
  });

  // ── 6. Background left-click pan ─────────────────────────────────────────
  test('left-click drag on canvas background pans', async ({ page }) => {
    const canvas = page.locator('[data-ost-export]');
    const box = (await canvas.boundingBox())!;
    // Bottom-right corner — well away from cards and toolbar buttons
    const sx = box.x + box.width * 0.88;
    const sy = box.y + box.height * 0.78;

    const content = page.locator('[data-ost-export-content]');
    const before = await content.evaluate((el) => (el as HTMLElement).style.transform);

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx - 120, sy - 80, { steps: 5 });
    await page.mouse.up();

    const after = await content.evaluate((el) => (el as HTMLElement).style.transform);
    expect(after).not.toBe(before);
  });

  // ── 8. Sidebar status dropdown ──────────────────────────────────────────
  test('sidebar status dropdown opens and saves a value', async ({ page }) => {
    // Click first card to open the sidebar
    await page.locator('[data-ost-card]').first().click();
    await page.waitForSelector('[data-testid="sidebar-status-trigger"]', { timeout: 5_000 });

    // Open the status select — this is the z-index regression guard
    await page.getByTestId('sidebar-status-trigger').click();

    // At least one non-"No status" option must be visible (SelectContent rendered above sidebar)
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();

    // Select the second option (first type-specific status, not "No status")
    await options.nth(1).click();

    // The trigger should now show a non-placeholder value
    const triggerText = await page.getByTestId('sidebar-status-trigger').textContent();
    expect(triggerText?.trim()).not.toBe('');
    expect(triggerText?.trim()).not.toBe('Select status');
  });

  // ── 7. Card drag does NOT pan ─────────────────────────────────────────────
  test('dragging a card does not pan the canvas', async ({ page }) => {
    const content = page.locator('[data-ost-export-content]');
    const before = await content.evaluate((el) => (el as HTMLElement).style.transform);

    const card = page.locator('[data-ost-card]').first();
    const box = (await card.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 5 });
    await page.mouse.up();

    const after = await content.evaluate((el) => (el as HTMLElement).style.transform);
    expect(after).toBe(before);
  });
});
