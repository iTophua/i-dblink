import { test, expect } from '@playwright/test';

test.describe('Query Flow', () => {
  test('type SQL in editor', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Find SQL editor
    const editor = page.locator('[class*="sql-editor"], [class*="editor"] textarea');
    await editor.click();
    await editor.fill('SELECT * FROM users LIMIT 10;');
    
    // Verify SQL is in editor
    const value = await editor.inputValue();
    expect(value).toContain('SELECT');
  });

  test('execute query', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Click execute button
    const execBtn = page.locator('button:has-text("执行"), button:has-text("Execute"), button:has-text("Run")');
    await execBtn.click();
    
    // Results area should appear
    const results = page.locator('[class*="result"], [class*="table"], [class*="grid"]');
    await expect(results.first()).toBeVisible({ timeout: 10000 });
  });

  test('display query results', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Results grid should be visible
    const grid = page.locator('[class*="ag-grid"], [class*="data-grid"]');
    await expect(grid.first()).toBeVisible({ timeout: 10000 });
  });

  test('export results to CSV', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Click export button
    const exportBtn = page.locator('button:has-text("导出"), button:has-text("Export")');
    await exportBtn.click();
    
    // CSV option should be available
    const csvOption = page.locator('menuitem:has-text("CSV"), [role="menuitem"]:has-text("CSV")');
    await expect(csvOption).toBeVisible({ timeout: 3000 });
  });

  test('query history', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // History panel should be accessible
    const historyBtn = page.locator('button:has-text("历史"), button:has-text("History")');
    await historyBtn.click();
    
    const historyPanel = page.locator('[class*="history"]');
    await expect(historyPanel).toBeVisible({ timeout: 3000 });
  });
});
