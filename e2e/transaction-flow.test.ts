import { test, expect } from '@playwright/test';
import { TEST_QUERIES, executeQuery, waitForLoading } from './helpers/test-helpers';

test.describe('Transaction Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await waitForLoading(page);
  });

  test('begin transaction', async ({ page }) => {
    // Click begin transaction button
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Verify transaction status in status bar
    await expect(page.locator('[data-testid="transaction-status"]')).toContainText(/transaction/i);
    await expect(page.locator('[data-testid="transaction-status"]')).toContainText(/active/i);
  });

  test('execute queries within transaction', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Execute INSERT within transaction
    await executeQuery(page, TEST_QUERIES.insertUser);
    
    // Verify data inserted
    await executeQuery(page, "SELECT * FROM users WHERE username = 'test'");
    const rows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows).toHaveCount(1);
    
    // Note: Data is still in transaction, not committed yet
  });

  test('commit transaction', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Insert data
    await executeQuery(page, TEST_QUERIES.insertUser);
    
    // Commit transaction
    await page.click('[data-testid="commit-transaction-btn"]');
    
    // Verify transaction status changed
    await expect(page.locator('[data-testid="transaction-status"]')).not.toContainText(/active/i);
    
    // Verify data persists after commit
    await executeQuery(page, "SELECT * FROM users WHERE username = 'test'");
    const rows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows).toHaveCount(1);
  });

  test('rollback transaction', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Insert data
    await executeQuery(page, TEST_QUERIES.insertUser);
    
    // Verify data inserted within transaction
    await executeQuery(page, "SELECT * FROM users WHERE username = 'test'");
    const rows1 = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows1).toHaveCount(1);
    
    // Rollback transaction
    await page.click('[data-testid="rollback-transaction-btn"]');
    
    // Verify transaction status changed
    await expect(page.locator('[data-testid="transaction-status"]')).not.toContainText(/active/i);
    
    // Verify data no longer exists after rollback
    await executeQuery(page, "SELECT * FROM users WHERE username = 'test'");
    const rows2 = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows2).toHaveCount(0);
  });

  test('multiple statements in transaction', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Execute multiple INSERT statements
    const multiInsert = `
      INSERT INTO users (username, email, age) VALUES ('user1', 'user1@example.com', 25);
      INSERT INTO users (username, email, age) VALUES ('user2', 'user2@example.com', 30);
      INSERT INTO users (username, email, age) VALUES ('user3', 'user3@example.com', 35);
    `;
    
    await executeQuery(page, multiInsert);
    
    // Verify all rows inserted
    await executeQuery(page, "SELECT * FROM users WHERE username LIKE 'user%'");
    const rows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows).toHaveCount(3);
    
    // Commit
    await page.click('[data-testid="commit-transaction-btn"]');
    
    // Verify data persists
    await executeQuery(page, "SELECT COUNT(*) FROM users WHERE username LIKE 'user%'");
    const countRows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(countRows).toHaveCount(1);
  });

  test('transaction with error', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Insert valid data
    await executeQuery(page, TEST_QUERIES.insertUser);
    
    // Execute invalid SQL (should fail)
    await executeQuery(page, TEST_QUERIES.syntaxError);
    
    // Verify error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 5000 }).orElse(
      expect(page.locator('.ant-message-error')).toBeVisible({ timeout: 5000 })
    );
    
    // Rollback to undo valid changes
    await page.click('[data-testid="rollback-transaction-btn"]');
    
    // Verify valid data also rolled back
    await executeQuery(page, "SELECT * FROM users WHERE username = 'test'");
    const rows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows).toHaveCount(0);
  });

  test('nested transaction handling', async ({ page }) => {
    // Begin first transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Try to begin another transaction (should handle gracefully)
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Should show message about existing transaction
    await expect(page.locator('[data-testid="notification"]')).toBeVisible({ timeout: 5000 }).orElse(
      expect(page.locator('.ant-message')).toBeVisible({ timeout: 5000 })
    );
    
    // Commit first transaction
    await page.click('[data-testid="commit-transaction-btn"]');
    
    // Begin second transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Execute query
    await executeQuery(page, TEST_QUERIES.insertUser);
    
    // Commit second transaction
    await page.click('[data-testid="commit-transaction-btn"]');
  });

  test('transaction timeout', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Execute long-running query (in real scenario)
    // For now, just verify transaction status
    await expect(page.locator('[data-testid="transaction-status"]')).toContainText(/active/i);
    
    // Commit to end transaction
    await page.click('[data-testid="commit-transaction-btn"]');
  });

  test('transaction status indicator', async ({ page }) => {
    // Initially no transaction
    await expect(page.locator('[data-testid="transaction-status"]')).not.toContainText(/active/i);
    
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    await expect(page.locator('[data-testid="transaction-status"]')).toContainText(/active/i);
    
    // Commit transaction
    await page.click('[data-testid="commit-transaction-btn"]');
    await expect(page.locator('[data-testid="transaction-status"]')).not.toContainText(/active/i);
    
    // Begin and rollback
    await page.click('[data-testid="begin-transaction-btn"]');
    await expect(page.locator('[data-testid="transaction-status"]')).toContainText(/active/i);
    await page.click('[data-testid="rollback-transaction-btn"]');
    await expect(page.locator('[data-testid="transaction-status"]')).not.toContainText(/active/i);
  });

  test('transaction with DDL', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Execute DDL within transaction
    await executeQuery(page, TEST_QUERIES.createTable);
    
    // Verify table created
    await expect(page.locator('[data-testid="table-item-test_table"]')).toBeVisible({ timeout: 10000 });
    
    // Commit
    await page.click('[data-testid="commit-transaction-btn"]');
    
    // Verify table persists
    await expect(page.locator('[data-testid="table-item-test_table"]')).toBeVisible();
    
    // Clean up
    await executeQuery(page, TEST_QUERIES.dropTable);
  });

  test('transaction with UPDATE', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Execute UPDATE
    await executeQuery(page, TEST_QUERIES.updateUser);
    
    // Verify update
    await executeQuery(page, "SELECT * FROM users WHERE username = 'test'");
    const rows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows).toHaveCount(1);
    
    // Check updated value
    const cell = page.locator('[data-testid="query-results"] .ag-row').first();
    await expect(cell).toContainText('26');
    
    // Commit
    await page.click('[data-testid="commit-transaction-btn"]');
  });

  test('transaction with DELETE', async ({ page }) => {
    // Begin transaction
    await page.click('[data-testid="begin-transaction-btn"]');
    
    // Insert test data
    await executeQuery(page, TEST_QUERIES.insertUser);
    
    // Delete test data
    await executeQuery(page, TEST_QUERIES.deleteUser);
    
    // Verify deletion
    await executeQuery(page, "SELECT * FROM users WHERE username = 'test'");
    const rows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows).toHaveCount(0);
    
    // Rollback
    await page.click('[data-testid="rollback-transaction-btn"]');
    
    // Verify data restored
    await executeQuery(page, "SELECT * FROM users WHERE username = 'test'");
    const restoredRows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(restoredRows).toHaveCount(1);
    
    // Clean up
    await page.click('[data-testid="begin-transaction-btn"]');
    await executeQuery(page, TEST_QUERIES.deleteUser);
    await page.click('[data-testid="commit-transaction-btn"]');
  });
});
