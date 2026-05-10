import { test, expect } from '@playwright/test';

test.describe('TC-12 应用设置', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await page.waitForTimeout(2000);
  });

  test('TC-12a: 打开设置对话框', async ({ page }) => {
    // Click settings button using data-testid
    await page.click('[data-testid="toolbar-settings"]');
    
    // Settings dialog should appear
    await expect(page.locator('.settings-dialog-modal')).toBeVisible({ timeout: 5000 });
    
    // Verify title contains "设置" or "Settings"
    const title = await page.locator('.settings-dialog-modal .ant-modal-title').textContent();
    expect(title).toMatch(/设置|Settings/i);
  });

  test('TC-12b: 切换外观主题', async ({ page }) => {
    await page.click('[data-testid="toolbar-settings"]');
    await expect(page.locator('.settings-dialog-modal')).toBeVisible();
    
    // Click on appearance tab
    await page.click('.settings-dialog-modal .ant-menu-item:has-text("外观"), .settings-dialog-modal .ant-menu-item:has-text("Appearance")');
    
    // Theme preset selector should be visible
    await expect(page.locator('.settings-dialog-modal .ant-select').first()).toBeVisible();
    
    // Theme mode selector should be visible
    const themeModeSelect = page.locator('.settings-dialog-modal .ant-select').nth(1);
    await expect(themeModeSelect).toBeVisible();
  });

  test('TC-12c: 切换语言', async ({ page }) => {
    await page.click('[data-testid="toolbar-settings"]');
    await expect(page.locator('.settings-dialog-modal')).toBeVisible();
    
    // Click on language tab
    await page.click('.settings-dialog-modal .ant-menu-item:has-text("语言"), .settings-dialog-modal .ant-menu-item:has-text("Language")');
    
    // Language selector should be present
    const langSelect = page.locator('.settings-dialog-modal .ant-select');
    await expect(langSelect).toBeVisible({ timeout: 3000 });
    
    // Should have Chinese and English options
    await langSelect.click();
    await expect(page.locator('.ant-select-item:has-text("简体中文")')).toBeVisible();
    await expect(page.locator('.ant-select-item:has-text("English")')).toBeVisible();
    
    // Close dropdown
    await page.keyboard.press('Escape');
  });

  test('TC-12d: 重置设置按钮存在', async ({ page }) => {
    await page.click('[data-testid="toolbar-settings"]');
    await expect(page.locator('.settings-dialog-modal')).toBeVisible();
    
    // Reset button should be present in footer
    await expect(page.locator('[data-testid="settings-reset-btn"]')).toBeVisible({ timeout: 3000 });
    
    // Save button should be present (text has spaces in Ant Design 6)
    const saveBtn = page.locator('.settings-dialog-modal button:has-text("保 存"), .settings-dialog-modal button:has-text("Save")');
    await expect(saveBtn).toBeVisible();
    
    // Cancel button should be present (text has spaces in Ant Design 6)
    const cancelBtn = page.locator('.settings-dialog-modal button:has-text("取 消"), .settings-dialog-modal button:has-text("Cancel")');
    await expect(cancelBtn).toBeVisible();
  });

  test('TC-12e: 关闭设置对话框', async ({ page }) => {
    await page.click('[data-testid="toolbar-settings"]');
    await expect(page.locator('.settings-dialog-modal')).toBeVisible();
    
    // Click cancel button (text has spaces in Ant Design 6)
    await page.click('.settings-dialog-modal button:has-text("取 消"), .settings-dialog-modal button:has-text("Cancel")');
    
    // Dialog should close
    await expect(page.locator('.settings-dialog-modal')).not.toBeVisible({ timeout: 3000 });
  });

  test('TC-12f: 设置页面大小', async ({ page }) => {
    await page.click('[data-testid="toolbar-settings"]');
    await expect(page.locator('.settings-dialog-modal')).toBeVisible();
    
    // Should be on general tab by default
    // Page size input should be visible (InputNumber doesn't have type="number" in Ant Design 6)
    const pageSizeInput = page.locator('.settings-dialog-modal input').first();
    await expect(pageSizeInput).toBeVisible();
    
    // Change page size
    await pageSizeInput.fill('500');
    
    // Save settings (text has spaces in Ant Design 6)
    await page.click('.settings-dialog-modal button:has-text("保 存"), .settings-dialog-modal button:has-text("Save")');
    
    // Dialog should close
    await expect(page.locator('.settings-dialog-modal')).not.toBeVisible({ timeout: 3000 });
  });
});
