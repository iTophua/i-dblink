import { test, expect } from '@playwright/test';

test.describe('TC-05/06 连接管理', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await page.waitForTimeout(2000); // Wait for app to load
    
    // Close any open modals by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('TC-05: 打开新建连接对话框', async ({ page }) => {
    // Click new connection button using data-testid
    await page.click('[data-testid="toolbar-new-connection"]');
    
    // Dialog should appear - use the class on the actual modal element
    await expect(page.locator('.connection-dialog-modal')).toBeVisible({ timeout: 5000 });
  });

  test('TC-05: 填写连接表单', async ({ page }) => {
    await page.click('[data-testid="toolbar-new-connection"]');
    await expect(page.locator('.connection-dialog-modal')).toBeVisible();
    
    // Fill connection name
    await page.fill('[data-testid="conn-name-input"]', 'E2E Test MySQL');
    
    // Fill host
    await page.fill('[data-testid="conn-host-input"]', 'localhost');
    
    // Fill port
    await page.fill('[data-testid="conn-port-input"]', '3306');
    
    // Fill username
    await page.fill('[data-testid="conn-username-input"]', 'root');
    
    // Fill password
    await page.fill('[data-testid="conn-password-input"]', 'password');
    
    // Fill database (optional)
    await page.fill('[data-testid="conn-database-input"]', 'testdb');
  });

  test('TC-06: 连接表单验证', async ({ page }) => {
    await page.click('[data-testid="toolbar-new-connection"]');
    await expect(page.locator('.connection-dialog-modal')).toBeVisible();
    
    // Try to save without filling required fields
    await page.click('[data-testid="conn-save-btn"]');
    
    // Should show validation error - Ant Design shows red border and message
    await expect(page.locator('.ant-form-item-has-error').first()).toBeVisible({ timeout: 3000 });
  });

  test('TC-06: 取消创建连接', async ({ page }) => {
    await page.click('[data-testid="toolbar-new-connection"]');
    await expect(page.locator('.connection-dialog-modal')).toBeVisible();
    
    // Fill some data
    await page.fill('[data-testid="conn-name-input"]', 'Test Connection');
    
    // Click cancel button (close button or cancel)
    await page.keyboard.press('Escape');
    
    // Dialog should close
    await expect(page.locator('.connection-dialog-modal')).not.toBeVisible({ timeout: 3000 });
    
    // Connection should not appear in tree
    const connections = await page.locator('[data-testid^="connection-item-"]').count();
    expect(connections).toBe(0);
  });

  test('TC-05: 连接树初始状态', async ({ page }) => {
    // Connection tree container should be visible
    await expect(page.locator('.connection-tree-container')).toBeVisible();
    
    // No connections should exist initially
    const connections = await page.locator('[data-testid^="connection-item-"]').count();
    expect(connections).toBe(0);
    
    // Should show empty state or placeholder
    const treeContent = await page.locator('.connection-tree-container').textContent();
    expect(treeContent).toBeTruthy();
  });
});
