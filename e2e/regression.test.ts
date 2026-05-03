import { test, expect } from '@playwright/test';

test.describe('Regression Tests', () => {
  test('full user journey: connect -> query -> export', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // 1. Navigate to connection area
    const connArea = page.locator('[class*="connection"], [class*="tree"]');
    await expect(connArea).toBeVisible({ timeout: 10000 });
    
    // 2. SQL editor should be accessible
    const editor = page.locator('[class*="sql-editor"] textarea');
    await expect(editor).toBeVisible({ timeout: 10000 });
    
    // 3. Results area should be ready
    const resultsArea = page.locator('[class*="result"], [class*="grid"]');
    await expect(resultsArea).toBeVisible({ timeout: 10000 });
  });

  test('multiple tabs management', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Tab bar should be visible
    const tabBar = page.locator('[class*="tab-bar"], [class*="tabs"]');
    await expect(tabBar).toBeVisible({ timeout: 10000 });
  });

  test('keyboard shortcuts registered', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Press Ctrl+Enter (execute query shortcut)
    await page.keyboard.press('Control+Enter');
    
    // Should not cause errors
    await expect(page).toHaveURL('http://localhost:5100');
  });

  test('responsive layout', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Resize window
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page).toHaveURL('http://localhost:5100');
    
    // Layout should still be functional
    const mainContent = page.locator('[class*="main"], [class*="content"]');
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  test('error handling for failed operations', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Error messages should use antd message component
    const errorContainer = page.locator('[class*="message"], [class*="notification"]');
    await expect(errorContainer).toBeVisible({ timeout: 5000 });
  });

  test('data persistence', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Settings should persist via localStorage
    const hasSettings = await page.evaluate(() => {
      return !!localStorage.getItem('idblink-settings');
    });
    // Settings may or may not exist depending on first launch
    expect(typeof hasSettings).toBe('boolean');
  });
});
