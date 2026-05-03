import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('app loads successfully', async ({ page }) => {
    await page.goto('http://localhost:5100');
    await expect(page).toHaveTitle(/iDBLink/i);
  });

  test('main layout renders', async ({ page }) => {
    await page.goto('http://localhost:5100');
    // Check that the main container exists
    await expect(page.locator('body')).toBeVisible();
  });

  test('sidebar is visible', async ({ page }) => {
    await page.goto('http://localhost:5100');
    // Sidebar should be present
    const sidebar = page.locator('.ant-layout-sider, [class*="sidebar"]');
    await expect(sidebar.first()).toBeVisible({ timeout: 10000 });
  });

  test('sql editor area exists', async ({ page }) => {
    await page.goto('http://localhost:5100');
    // SQL editor area should be present
    const editorArea = page.locator('[class*="sql-editor"], [class*="editor"]');
    await expect(editorArea.first()).toBeVisible({ timeout: 10000 });
  });

  test('status bar is visible', async ({ page }) => {
    await page.goto('http://localhost:5100');
    const statusBar = page.locator('[class*="status-bar"], [class*="footer"]');
    await expect(statusBar.first()).toBeVisible({ timeout: 10000 });
  });
});
