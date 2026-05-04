import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E Test Helpers for iDBLink
 */

export async function createConnection(page: Page, config: {
  name: string;
  dbType: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
}) {
  // Click "New Connection" button
  await page.click('[data-testid="new-connection-btn"]');
  
  // Fill connection form
  await page.fill('[data-testid="conn-name"]', config.name);
  await page.selectOption('[data-testid="conn-db-type"]', config.dbType);
  await page.fill('[data-testid="conn-host"]', config.host);
  await page.fill('[data-testid="conn-port"]', config.port.toString());
  await page.fill('[data-testid="conn-username"]', config.username);
  await page.fill('[data-testid="conn-password"]', config.password);
  
  if (config.database) {
    await page.fill('[data-testid="conn-database"]', config.database);
  }

  // Test connection
  await page.click('[data-testid="test-connection-btn"]');
  await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 10000 });

  // Save connection
  await page.click('[data-testid="save-connection-btn"]');
  await expect(page.locator(`text=${config.name}`)).toBeVisible();
}

export async function connectToDatabase(page: Page, connectionName: string) {
  await page.click(`text=${connectionName}`);
  await expect(page.locator('.connection-status-connected')).toBeVisible({ timeout: 10000 });
}

export async function executeQuery(page: Page, sql: string) {
  // Clear existing content and type new SQL
  await page.click('[data-testid="sql-editor"]');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.fill('[data-testid="sql-editor"] textarea', sql);
  
  // Execute query (Ctrl+Enter)
  await page.keyboard.press('Control+Enter');
  
  // Wait for results
  await expect(page.locator('[data-testid="query-results"]')).toBeVisible({ timeout: 15000 });
}

export async function getQueryResults(page: Page) {
  return page.locator('[data-testid="query-results"] .ag-row');
}

export async function selectTable(page: Page, tableName: string) {
  await page.click(`[data-testid="table-item-${tableName}"]`);
}

export async function openTableContextMenu(page: Page, tableName: string) {
  await page.click(`[data-testid="table-item-${tableName}"]`, { button: 'right' });
}

export async function waitForLoading(page: Page) {
  await expect(page.locator('.ant-spin')).not.toBeVisible({ timeout: 30000 });
}

export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
}

/**
 * Test data constants
 */
export const TEST_CONNECTIONS = {
  mysql: {
    name: 'Test MySQL',
    dbType: 'mysql',
    host: 'localhost',
    port: 13306,
    username: 'testuser',
    password: 'testpass',
    database: 'testdb',
  },
  postgres: {
    name: 'Test PostgreSQL',
    dbType: 'postgresql',
    host: 'localhost',
    port: 15432,
    username: 'testuser',
    password: 'testpassword',
    database: 'testdb',
  },
  sqlite: {
    name: 'Test SQLite',
    dbType: 'sqlite',
    host: '',
    port: 0,
    username: '',
    password: '',
    database: ':memory:',
  },
};

export const TEST_QUERIES = {
  selectAllUsers: 'SELECT * FROM users',
  selectUserOrders: 'SELECT * FROM orders WHERE user_id = 1',
  insertUser: "INSERT INTO users (username, email, age) VALUES ('test', 'test@example.com', 25)",
  updateUser: "UPDATE users SET age = 26 WHERE username = 'test'",
  deleteUser: "DELETE FROM users WHERE username = 'test'",
  createTable: 'CREATE TABLE IF NOT EXISTS test_table (id INT PRIMARY KEY, name VARCHAR(50))',
  dropTable: 'DROP TABLE IF EXISTS test_table',
  syntaxError: 'SELECT * FORM users', // Intentional typo
};
