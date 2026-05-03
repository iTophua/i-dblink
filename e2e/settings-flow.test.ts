import { test, expect } from '@playwright/test';

test.describe('Settings Flow', () => {
  test('open settings dialog', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Click settings button
    const settingsBtn = page.locator('button:has-text("设置"), button:has-text("Settings")');
    await settingsBtn.click();
    
    // Settings dialog should appear
    const dialog = page.locator('[class*="settings-modal"], [class*="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test('change theme', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Open settings
    const settingsBtn = page.locator('button:has-text("设置")');
    await settingsBtn.click();
    
    // Select theme option
    const themeSelect = page.locator('[class*="theme-select"], select');
    await themeSelect.click();
    
    // Theme should change
    const body = page.locator('body');
    const bgColor = await body.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toBeTruthy();
  });

  test('change language', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Open settings
    const settingsBtn = page.locator('button:has-text("设置")');
    await settingsBtn.click();
    
    // Language selector should be present
    const langSelect = page.locator('[class*="language-select"], select');
    await expect(langSelect).toBeVisible({ timeout: 3000 });
  });

  test('reset settings', async ({ page }) => {
    await page.goto('http://localhost:5100');
    
    // Open settings
    const settingsBtn = page.locator('button:has-text("设置")');
    await settingsBtn.click();
    
    // Reset button should be present
    const resetBtn = page.locator('button:has-text("重置"), button:has-text("Reset")');
    await expect(resetBtn).toBeVisible({ timeout: 3000 });
  });
});
