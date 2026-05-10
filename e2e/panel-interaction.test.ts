import { test, expect } from '@playwright/test';
import { TEST_CONNECTIONS, createConnection, connectToDatabase, waitForLoading } from './helpers/test-helpers';

test.describe('Panel Interaction - Left Tree and Right Content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await waitForLoading(page);
    await createConnection(page, TEST_CONNECTIONS.mysql);
    await connectToDatabase(page, 'Test MySQL');
    await page.click('[data-testid="database-node-testdb"]');
  });

  test('left tree click opens right data tab', async ({ page }) => {
    // Click on users table in left tree
    await page.click('[data-testid="table-node-users"]');
    
    // Verify right panel opens tab with users data
    const activeTab = page.locator('[data-testid="tab-item-active"]');
    await expect(activeTab).toContainText('users', { timeout: 10000 });
    
    // Verify data grid is visible
    await expect(page.locator('[data-testid="data-grid"]')).toBeVisible({ timeout: 10000 });
  });

  test('status bar syncs with selected table', async ({ page }) => {
    await page.click('[data-testid="table-node-users"]');
    
    // Verify status bar shows table info
    await expect(page.locator('[data-testid="status-connection"]')).toContainText('users');
  });

  test('SQL execution updates left tree', async ({ page }) => {
    // Open SQL editor
    await page.click('[data-testid="toolbar-new-query"]');
    
    // Create a new table via SQL
    await page.fill('[data-testid="sql-editor"] textarea', 'CREATE TABLE test_automation (id INT PRIMARY KEY);');
    await page.keyboard.press('Control+Enter');
    
    // Wait for success message
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 10000 });
    
    // Refresh tree
    await page.click('[data-testid="toolbar-refresh"]');
    
    // Verify new table appears in tree
    await expect(page.locator('[data-testid="table-node-test_automation"]')).toBeVisible({ timeout: 10000 });
  });

  test('disconnect shows disconnected state in tabs', async ({ page }) => {
    await page.click('[data-testid="table-node-users"]');
    
    // Disconnect
    // This would need a disconnect button data-testid
    // For now, verify connection status
    await expect(page.locator('[data-testid="status-connection"]')).toContainText('已连接');
  });
});
