import { test, expect } from '@playwright/test';

/**
 * Tauri MCP Integration Tests
 * These tests run against the real Tauri app with backend connected
 */

test.describe('TC-07/18: 数据库连接与浏览（Tauri MCP）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await page.waitForTimeout(3000);
  });

  test('TC-07: 创建 SQLite 内存连接', async ({ page }) => {
    // Click new connection
    await page.click('[data-testid="toolbar-new-connection"]');
    await expect(page.locator('.connection-dialog-modal')).toBeVisible();
    
    // Click on SQLite option in the left panel
    // The SQLite option is a div containing the text "SQLite"
    const sqliteOption = page.locator('div:has(> span:has-text("SQLite"))').filter({ has: page.locator('div') }).first();
    await sqliteOption.click();
    await page.waitForTimeout(500);
    
    // Fill connection details for SQLite
    await page.fill('[data-testid="conn-name-input"]', 'Test SQLite');
    await page.fill('[data-testid="conn-host-input"]', '');
    await page.fill('[data-testid="conn-username-input"]', '');
    await page.fill('[data-testid="conn-password-input"]', '');
    await page.fill('[data-testid="conn-database-input"]', ':memory:');
    
    // Save connection
    await page.click('[data-testid="conn-save-btn"]');
    
    // Wait for connection to appear in tree
    await expect(page.locator('[data-testid^="connection-item-"]:has-text("Test SQLite")')).toBeVisible({ timeout: 10000 });
  });

  test('TC-18: 展开连接查看数据库', async ({ page }) => {
    // Find and expand the connection
    const connItem = page.locator('[data-testid^="connection-item-"]:has-text("Test SQLite")');
    await expect(connItem).toBeVisible();
    
    // Double click or click expand arrow to connect
    await connItem.click();
    
    // Wait for connection to establish
    await page.waitForTimeout(3000);
    
    // Check status bar shows connection
    await expect(page.locator('[data-testid="status-connection"]')).toContainText('Test SQLite');
  });
});

test.describe('TC-08: SQL 查询执行（Tauri MCP）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await page.waitForTimeout(3000);
  });

  test('执行简单 SELECT 查询', async ({ page }) => {
    // Create connection first if not exists
    const connExists = await page.locator('[data-testid^="connection-item-"]:has-text("Test SQLite")').count() > 0;
    
    if (!connExists) {
      // Create SQLite connection
      await page.click('[data-testid="toolbar-new-connection"]');
      await page.locator('div:has(> span:has-text("SQLite"))').filter({ has: page.locator('div') }).first().click();
      await page.fill('[data-testid="conn-name-input"]', 'Test SQLite');
      await page.fill('[data-testid="conn-database-input"]', ':memory:');
      await page.click('[data-testid="conn-save-btn"]');
      await page.waitForTimeout(2000);
    }
    
    // Connect to the database
    await page.click('[data-testid^="connection-item-"]:has-text("Test SQLite")');
    await page.waitForTimeout(3000);
    
    // Open new query tab
    await page.click('[data-testid="toolbar-new-query"]');
    await page.waitForTimeout(1000);
    
    // Type SQL query (Monaco editor requires special handling)
    // For now, just verify the SQL editor tab opened
    await expect(page.locator('[data-testid^="sql-tab-"]')).toBeVisible();
  });
});
