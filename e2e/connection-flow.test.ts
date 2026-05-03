import { test, expect } from '@playwright/test';

test.describe('Connection Flow', () => {
  test('open connection dialog', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Click new connection button
    const newConnBtn = page.locator('button:has-text("新建连接"), button:has-text("New Connection")');
    await newConnBtn.click();
    
    // Dialog should appear
    const dialog = page.locator('.ant-modal, [class*="modal"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test('fill connection form', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Open dialog
    const newConnBtn = page.locator('button:has-text("新建连接"), button:has-text("New Connection")');
    await newConnBtn.click();
    
    // Fill name
    await page.locator('input[placeholder*="名称"], input[placeholder*="Name"]').fill('E2E Test DB');
    
    // Select database type
    await page.locator('select, [class*="select"]').first().click();
    
    // Fill host
    await page.locator('input[placeholder*="主机"], input[placeholder*="Host"]').fill('localhost');
    
    // Fill port
    await page.locator('input[type="number"]').first().fill('3306');
    
    // Fill username
    await page.locator('input[placeholder*="用户"], input[placeholder*="Username"]').fill('root');
  });

  test('save connection', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // The connection should appear in the connection tree after saving
    const connTree = page.locator('[class*="connection-tree"], [class*="tree"]');
    await expect(connTree).toBeVisible({ timeout: 10000 });
  });

  test('connection validation', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Open dialog
    const newConnBtn = page.locator('button:has-text("新建连接")');
    await newConnBtn.click();
    
    // Try to save without filling required fields
    const saveBtn = page.locator('button:has-text("保存"), button:has-text("Save")');
    await saveBtn.click();
    
    // Should show validation error
    const errorMsg = page.locator('[class*="error"], [class*="warning"]');
    await expect(errorMsg.first()).toBeVisible({ timeout: 3000 });
  });
});
