import { test, expect } from '@playwright/test';

test.describe('Layout and project settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-ost-card]', { timeout: 10_000 });
  });

  test('layout toggle switches direction', async ({ page }) => {
    const toggleButton = page.getByTestId('layout-toggle');
    // Default is vertical
    await expect(toggleButton).toHaveAttribute('title', 'Layout: Vertical');

    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute('title', 'Layout: Horizontal');

    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute('title', 'Layout: Vertical');
  });

  test('project name can be edited', async ({ page }) => {
    await page.getByTestId('project-name-button').click();
    const input = page.getByTestId('project-name-input');
    await expect(input).toBeVisible();
    await input.fill('Renamed Project');
    await input.press('Enter');
    // Should show the new name
    await expect(page.getByTestId('project-name-button')).toContainText('Renamed Project');
  });

  test('project name escape cancels edit', async ({ page }) => {
    const nameButton = page.getByTestId('project-name-button');
    const original = await nameButton.textContent();
    await nameButton.click();
    const input = page.getByTestId('project-name-input');
    await input.fill('Should Be Cancelled');
    await input.press('Escape');
    await expect(nameButton).toContainText(original!.trim());
  });

  test('project name updates markdown heading', async ({ page }) => {
    await page.getByTestId('project-name-button').click();
    const input = page.getByTestId('project-name-input');
    await input.fill('New Heading');
    await input.press('Enter');

    // Open markdown editor and verify the heading changed
    await page.getByTestId('markdown-editor-trigger').click();
    const textarea = page.getByTestId('markdown-textarea');
    const content = await textarea.inputValue();
    expect(content.startsWith('# New Heading')).toBe(true);
  });
});
