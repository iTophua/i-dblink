import { test, expect } from '@playwright/test';
import { TEST_CONNECTIONS, createConnection, connectToDatabase, waitForLoading } from './helpers/test-helpers';

test.describe('Connection Tree Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await waitForLoading(page);
  });

  test('connection tree renders with connections', async ({ page }) => {
    // Create a connection first
    await createConnection(page, TEST_CONNECTIONS.mysql);
    
    // Verify connection appears in tree
    await expect(page.locator('[data-testid^="connection-item-"]')).toBeVisible();
  });

  test('expand connection node to show databases', async ({ page }) => {
    await createConnection(page, TEST_CONNECTIONS.mysql);
    await connectToDatabase(page, 'Test MySQL');
    
    // Wait for connection tree to show databases
    await expect(page.locator('[data-testid^="database-node-"]')).toBeVisible({ timeout: 10000 });
  });

  test('expand database to show tables', async ({ page }) => {
    await createConnection(page, TEST_CONNECTIONS.mysql);
    await connectToDatabase(page, 'Test MySQL');
    
    // Click on database node to expand
    await page.click('[data-testid="database-node-testdb"]');
    
    // Wait for tables to appear
    await expect(page.locator('[data-testid="table-node-users"]')).toBeVisible({ timeout: 10000 });
  });

  test('click table node opens data tab', async ({ page }) => {
    await createConnection(page, TEST_CONNECTIONS.mysql);
    await connectToDatabase(page, 'Test MySQL');
    await page.click('[data-testid="database-node-testdb"]');
    
    // Click on users table
    await page.click('[data-testid="table-node-users"]');
    
    // Verify tab opens
    await expect(page.locator('[data-testid^="tab-item-"]')).toContainText('users');
  });

  test('connection status indicator', async ({ page }) => {
    await createConnection(page, TEST_CONNECTIONS.mysql);
    
    // Before connect - should show disconnected
    await expect(page.locator('[data-testid="status-connection"]')).toContainText('未连接');
    
    await connectToDatabase(page, 'Test MySQL');
    
    // After connect - should show connected
    await expect(page.locator('[data-testid="status-connection"]')).toContainText('已连接');
  });
});
