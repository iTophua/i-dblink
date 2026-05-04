import { test, expect } from '@playwright/test';
import { waitForLoading } from './helpers/test-helpers';

test.describe('Schema Comparison', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await waitForLoading(page);
  });

  test('open schema comparison dialog', async ({ page }) => {
    // Open schema comparison menu
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
  });

  test('select source and target connections', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select source connection
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    
    // Select target connection
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    
    // Verify selections
    await expect(page.locator('[data-testid="source-connection-select"]')).toHaveValue('conn-1');
    await expect(page.locator('[data-testid="target-connection-select"]')).toHaveValue('conn-2');
  });

  test('select databases for comparison', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select source database
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    
    // Select target database
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
  });

  test('compare schemas - identical', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select connections and databases
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
    
    // Execute comparison
    await page.click('[data-testid="execute-compare"]');
    
    // Wait for results
    await expect(page.locator('[data-testid="comparison-results"]')).toBeVisible({ timeout: 30000 });
    
    // Verify identical status
    await expect(page.locator('[data-testid="comparison-status"]')).toContainText(/identical/i).orElse(
      expect(page.locator('[data-testid="comparison-status"]')).toContainText(/same/i)
    );
  });

  test('compare schemas - different', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select connections and databases
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
    
    // Execute comparison
    await page.click('[data-testid="execute-compare"]');
    
    // Wait for results
    await expect(page.locator('[data-testid="comparison-results"]')).toBeVisible({ timeout: 30000 });
    
    // Verify differences found
    await expect(page.locator('[data-testid="comparison-status"]')).toContainText(/different/i).orElse(
      expect(page.locator('[data-testid="comparison-status"]')).toContainText(/difference/i)
    );
  });

  test('filter comparison results', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select connections and databases
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
    
    // Execute comparison
    await page.click('[data-testid="execute-compare"]');
    
    // Wait for results
    await expect(page.locator('[data-testid="comparison-results"]')).toBeVisible({ timeout: 30000 });
    
    // Filter by table type
    await page.click('[data-testid="filter-tables-only"]');
    
    // Verify filtered results
    const results = page.locator('[data-testid="comparison-result-item"]');
    await expect(results.first()).toBeVisible();
  });

  test('select specific tables to compare', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select specific tables
    await page.check('[data-testid="table-select-users"]');
    await page.check('[data-testid="table-select-orders"]');
    
    // Execute comparison
    await page.click('[data-testid="execute-compare"]');
    
    // Wait for results
    await expect(page.locator('[data-testid="comparison-results"]')).toBeVisible({ timeout: 30000 });
  });

  test('export comparison results', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select connections and databases
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
    
    // Execute comparison
    await page.click('[data-testid="execute-compare"]');
    
    // Wait for results
    await expect(page.locator('[data-testid="comparison-results"]')).toBeVisible({ timeout: 30000 });
    
    // Export results
    await page.click('[data-testid="export-comparison"]');
    
    // Wait for export completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 10000 });
  });

  test('comparison error handling', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Try to compare without selecting connections
    await page.click('[data-testid="execute-compare"]');
    
    // Verify error message
    await expect(page.locator('.ant-message-error')).toBeVisible({ timeout: 5000 });
  });

  test('comparison loading indicator', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select connections and databases
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
    
    // Execute comparison
    await page.click('[data-testid="execute-compare"]');
    
    // Wait for loading indicator
    await expect(page.locator('[data-testid="comparison-loading"]')).toBeVisible({ timeout: 5000 });
    
    // Wait for results
    await expect(page.locator('[data-testid="comparison-results"]')).toBeVisible({ timeout: 30000 });
  });

  test('comparison result details', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select connections and databases
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
    
    // Execute comparison
    await page.click('[data-testid="execute-compare"]');
    
    // Wait for results
    await expect(page.locator('[data-testid="comparison-results"]')).toBeVisible({ timeout: 30000 });
    
    // Click on a difference to see details
    await page.click('[data-testid="comparison-difference-item"]');
    
    // Wait for detail view
    await expect(page.locator('[data-testid="comparison-detail"]')).toBeVisible({ timeout: 10000 });
  });

  test('comparison with table name filter', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Enter table name filter
    await page.fill('[data-testid="table-name-filter"]', 'users');
    
    // Select connections and databases
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
    
    // Execute comparison
    await page.click('[data-testid="execute-compare"]');
    
    // Wait for results
    await expect(page.locator('[data-testid="comparison-results"]')).toBeVisible({ timeout: 30000 });
  });

  test('comparison cancel', async ({ page }) => {
    // Open schema comparison dialog
    await page.click('[data-testid="compare-schema-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select connections and databases
    await page.selectOption('[data-testid="source-connection-select"]', 'conn-1');
    await page.selectOption('[data-testid="target-connection-select"]', 'conn-2');
    await page.selectOption('[data-testid="source-database-select"]', 'testdb');
    await page.selectOption('[data-testid="target-database-select"]', 'testdb');
    
    // Cancel comparison
    await page.click('[data-testid="cancel-comparison"]');
    
    // Verify dialog closed
    await expect(page.locator('[data-testid="compare-schema-dialog"]')).not.toBeVisible();
  });
});
