import { test, expect } from '@playwright/test';

test.describe('Smoke Tests - TC-01 应用启动', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    // Wait for app to fully load
    await page.waitForLoadState('networkidle');
  });

  test('app loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/iDBLink/i);
  });

  test('main layout renders with all key components', async ({ page }) => {
    // Check toolbar is visible
    await expect(page.locator('[data-testid="toolbar-new-connection"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-refresh"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-new-query"]')).toBeVisible();
    await expect(page.locator('[data-testid="toolbar-settings"]')).toBeVisible();
  });

  test('sidebar is visible', async ({ page }) => {
    // Use the specific className from MainLayout
    await expect(page.locator('.sidebar-enhanced')).toBeVisible({ timeout: 10000 });
    // Also verify connection tree container exists
    await expect(page.locator('.connection-tree-container')).toBeVisible({ timeout: 10000 });
  });

  test('tab panel area exists', async ({ page }) => {
    // TabPanel has data-testid="tab-panel"
    await expect(page.locator('[data-testid="tab-panel"]')).toBeVisible({ timeout: 10000 });
  });

  test('status bar is visible', async ({ page }) => {
    // StatusBar has data-testid="status-bar"
    await expect(page.locator('[data-testid="status-bar"]')).toBeVisible({ timeout: 10000 });
    // Verify status shows not connected initially
    await expect(page.locator('[data-testid="status-connection"]')).toContainText(/未连接|Not Connected/i);
  });

  test('initial state shows empty workspace', async ({ page }) => {
    // Connection tree should be empty or show placeholder
    const tree = page.locator('.connection-tree-container');
    await expect(tree).toBeVisible();
    
    // Should have no connections initially
    const connections = page.locator('[data-testid^="connection-item-"]');
    await expect(connections).toHaveCount(0);
  });

  test('toolbar buttons are interactive', async ({ page }) => {
    // New connection button should be enabled
    const newConnBtn = page.locator('[data-testid="toolbar-new-connection"]');
    await expect(newConnBtn).toBeEnabled();
    
    // Settings button should be enabled
    const settingsBtn = page.locator('[data-testid="toolbar-settings"]');
    await expect(settingsBtn).toBeEnabled();
    
    // New query button should be enabled
    const newQueryBtn = page.locator('[data-testid="toolbar-new-query"]');
    await expect(newQueryBtn).toBeEnabled();
  });
});
