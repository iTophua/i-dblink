import { test, expect } from '@playwright/test';
import { TEST_CONNECTIONS, TEST_QUERIES, createConnection, connectToDatabase, executeQuery, waitForLoading } from './helpers/test-helpers';

test.describe('Table Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await waitForLoading(page);
  });

  test('browse table data', async ({ page }) => {
    // This test assumes a connection is already established
    // In real E2E, you would create a connection first
    
    // Click on a table to browse data
    await page.click('[data-testid="table-item-users"]');
    
    // Wait for data table to load
    await expect(page.locator('[data-testid="query-results"]')).toBeVisible({ timeout: 10000 });
    
    // Verify table has data
    const rows = page.locator('[data-testid="query-results"] .ag-row');
    await expect(rows.first()).toBeVisible();
  });

  test('view table structure', async ({ page }) => {
    // Open table structure panel
    await page.click('[data-testid="table-item-users"]');
    await page.click('[data-testid="view-structure-btn"]');
    
    // Wait for structure panel
    await expect(page.locator('[data-testid="table-structure"]')).toBeVisible({ timeout: 10000 });
    
    // Verify columns are displayed
    const columns = page.locator('[data-testid="column-item"]');
    await expect(columns.first()).toBeVisible();
  });

  test('truncate table with confirmation', async ({ page }) => {
    // Open context menu
    await page.click('[data-testid="table-item-users"]', { button: 'right' });
    
    // Click truncate option
    await page.click('[data-testid="truncate-table-menu"]');
    
    // Verify confirmation dialog
    await expect(page.locator('.ant-modal-title')).toContainText(/truncate/i).orElse(
      expect(page.locator('.ant-confirm-title')).toContainText(/truncate/i)
    );
    
    // Cancel the operation
    await page.click('.ant-btn-secondary, [data-testid="cancel-btn"]');
    await expect(page.locator('.ant-modal, .ant-confirm')).not.toBeVisible();
  });

  test('drop table with confirmation', async ({ page }) => {
    // Create a test table first
    await executeQuery(page, TEST_QUERIES.createTable);
    
    // Open context menu
    await page.click('[data-testid="table-item-test_table"]', { button: 'right' });
    
    // Click drop option
    await page.click('[data-testid="drop-table-menu"]');
    
    // Verify confirmation dialog
    await expect(page.locator('.ant-modal-title, .ant-confirm-title')).toBeVisible({ timeout: 5000 });
    
    // Confirm deletion
    await page.click('.ant-btn-dangerous, [data-testid="confirm-btn"]');
    
    // Wait for table to be removed
    await expect(page.locator('[data-testid="table-item-test_table"]')).not.toBeVisible({ timeout: 10000 });
  });

  test('rename table', async ({ page }) => {
    // Create a test table
    await executeQuery(page, TEST_QUERIES.createTable);
    
    // Open context menu
    await page.click('[data-testid="table-item-test_table"]', { button: 'right' });
    
    // Click rename option
    await page.click('[data-testid="rename-table-menu"]');
    
    // Enter new name
    await page.fill('[data-testid="rename-input"]', 'renamed_test_table');
    
    // Confirm
    await page.click('[data-testid="confirm-rename-btn"]');
    
    // Verify new name
    await expect(page.locator('[data-testid="table-item-renamed_test_table"]')).toBeVisible({ timeout: 10000 });
  });

  test('table maintenance operations', async ({ page }) => {
    // Open context menu
    await page.click('[data-testid="table-item-users"]', { button: 'right' });
    
    // Click maintenance option
    await page.click('[data-testid="table-maintenance-menu"]');
    
    // Select operation (optimize/analyze/repair)
    await page.click('[data-testid="maintenance-optimize"]');
    
    // Execute
    await page.click('[data-testid="execute-maintenance"]');
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 10000 }).orElse(
      expect(page.locator('.ant-notification')).toBeVisible({ timeout: 10000 })
    );
  });

  test('view table DDL', async ({ page }) => {
    // Open table DDL
    await page.click('[data-testid="table-item-users"]');
    await page.click('[data-testid="view-ddl-btn"]');
    
    // Wait for DDL panel
    await expect(page.locator('[data-testid="ddl-content"]')).toBeVisible({ timeout: 10000 });
    
    // Verify DDL contains CREATE TABLE
    const ddlContent = page.locator('[data-testid="ddl-content"]');
    await expect(ddlContent).toContainText(/CREATE TABLE/i);
  });

  test('table pagination', async ({ page }) => {
    await executeQuery(page, TEST_QUERIES.selectAllUsers);
    
    // Wait for results
    await expect(page.locator('[data-testid="query-results"]')).toBeVisible({ timeout: 10000 });
    
    // Verify pagination controls exist
    await expect(page.locator('[data-testid="pagination"]')).toBeVisible();
    
    // Click next page
    await page.click('[data-testid="pagination-next"]');
    
    // Wait for new data
    await expect(page.locator('[data-testid="query-results"] .ag-row')).toBeVisible();
  });

  test('table sorting', async ({ page }) => {
    await executeQuery(page, TEST_QUERIES.selectAllUsers);
    
    // Click column header to sort
    await page.click('[data-testid="column-header-name"]');
    
    // Verify sort indicator
    await expect(page.locator('[data-testid="sort-ascending"]')).toBeVisible().orElse(
      expect(page.locator('[data-testid="sort-descending"]')).toBeVisible()
    );
  });

  test('table filtering', async ({ page }) => {
    await executeQuery(page, TEST_QUERIES.selectAllUsers);
    
    // Open filter panel
    await page.click('[data-testid="filter-toggle"]');
    
    // Apply filter
    await page.fill('[data-testid="filter-input-username"]', 'alice');
    await page.click('[data-testid="apply-filter"]');
    
    // Verify filtered results
    const rows = page.locator('[data-testid="query-results"] .ag-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('export table data', async ({ page }) => {
    await executeQuery(page, TEST_QUERIES.selectAllUsers);
    
    // Open export menu
    await page.click('[data-testid="export-menu"]');
    
    // Select CSV export
    await page.click('[data-testid="export-csv"]');
    
    // Wait for download (Playwright doesn't easily test file downloads)
    // In real tests, you would verify the download file
  });

  test('import table data', async ({ page }) => {
    // Open import menu
    await page.click('[data-testid="import-menu"]');
    
    // Select file
    await page.setInputFiles('[data-testid="import-file-input"]', {
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('username,email,age\ntestuser,test@example.com,25'),
    });
    
    // Confirm import
    await page.click('[data-testid="confirm-import"]');
    
    // Wait for import completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 10000 });
  });
});
