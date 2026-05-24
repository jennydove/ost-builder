import { test, expect } from '@playwright/test';

test.describe('Markdown editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-ost-card]', { timeout: 10_000 });
  });

  test('opens with current markdown content', async ({ page }) => {
    await page.getByTestId('markdown-editor-trigger').click();
    const textarea = page.getByTestId('markdown-textarea');
    await expect(textarea).toBeVisible();
    const content = await textarea.inputValue();
    expect(content).toContain('# My Opportunity Solution Tree');
    expect(content).toContain('[Outcome]');
  });

  test('save updates the tree', async ({ page }) => {
    await page.getByTestId('markdown-editor-trigger').click();
    const textarea = page.getByTestId('markdown-textarea');

    await textarea.fill(`# Test Project

## [Outcome] Only One Outcome`);

    await page.getByTestId('markdown-save').click();
    // Dialog should close
    await expect(textarea).not.toBeVisible();
    // Tree should now have exactly one card
    const cards = page.locator('[data-ost-card]');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Only One Outcome');
  });

  test('cancel discards changes', async ({ page }) => {
    const beforeCount = await page.locator('[data-ost-card]').count();
    await page.getByTestId('markdown-editor-trigger').click();
    const textarea = page.getByTestId('markdown-textarea');

    await textarea.fill('## [Outcome] Replacement');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Card count should be unchanged
    const afterCount = await page.locator('[data-ost-card]').count();
    expect(afterCount).toBe(beforeCount);
  });

  test('markdown with hierarchy creates correct tree', async ({ page }) => {
    await page.getByTestId('markdown-editor-trigger').click();
    const textarea = page.getByTestId('markdown-textarea');

    await textarea.fill(`# Test

## [Outcome] Top Level

### [Opportunity] Mid Level

#### [Solution] Bottom Level`);

    await page.getByTestId('markdown-save').click();

    const cards = page.locator('[data-ost-card]');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('Top Level');
    await expect(cards.nth(1)).toContainText('Mid Level');
    await expect(cards.nth(2)).toContainText('Bottom Level');
  });
});
