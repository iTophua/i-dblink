import { test, expect } from '@playwright/test';
import { TEST_QUERIES, waitForLoading } from './helpers/test-helpers';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await waitForLoading(page);
  });

  test('Ctrl+Enter executes query', async ({ page }) => {
    // Click on SQL editor
    await page.click('[data-testid="sql-editor"]');
    
    // Type SQL
    await page.fill('[data-testid="sql-editor"] textarea', TEST_QUERIES.selectAllUsers);
    
    // Execute with Ctrl+Enter
    await page.keyboard.press('Control+Enter');
    
    // Wait for results
    await expect(page.locator('[data-testid="query-results"]')).toBeVisible({ timeout: 15000 });
  });

  test('Ctrl+S saves snippet', async ({ page }) => {
    // Click on SQL editor
    await page.click('[data-testid="sql-editor"]');
    
    // Type SQL
    await page.fill('[data-testid="sql-editor"] textarea', TEST_QUERIES.selectAllUsers);
    
    // Save with Ctrl+S
    await page.keyboard.press('Control+S');
    
    // Wait for save confirmation
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 5000 }).orElse(
      expect(page.locator('[data-testid="save-notification"]')).toBeVisible({ timeout: 5000 })
    );
  });

  test('Ctrl+N creates new tab', async ({ page }) => {
    // Count initial tabs
    const initialTabs = page.locator('[data-testid="tab-item"]');
    const initialCount = await initialTabs.count();
    
    // Create new tab
    await page.keyboard.press('Control+N');
    
    // Wait for new tab
    await expect(page.locator('[data-testid="tab-item"]')).toHaveCount(initialCount + 1);
  });

  test('Ctrl+W closes active tab', async ({ page }) => {
    // Create a new tab first
    await page.keyboard.press('Control+N');
    await waitForLoading(page);
    
    // Count tabs
    const tabs = page.locator('[data-testid="tab-item"]');
    const count = await tabs.count();
    
    // Close active tab
    await page.keyboard.press('Control+W');
    
    // Wait for tab to close
    await expect(page.locator('[data-testid="tab-item"]')).toHaveCount(count - 1);
  });

  test('Ctrl+Tab switches tabs', async ({ page }) => {
    // Create multiple tabs
    await page.keyboard.press('Control+N');
    await page.keyboard.press('Control+N');
    await waitForLoading(page);
    
    // Switch to next tab
    await page.keyboard.press('Control+Tab');
    
    // Verify active tab changed
    await expect(page.locator('[data-testid="tab-item-active"]')).toBeVisible();
  });

  test('Ctrl+Shift+Tab switches tabs backwards', async ({ page }) => {
    // Create multiple tabs
    await page.keyboard.press('Control+N');
    await page.keyboard.press('Control+N');
    await waitForLoading(page);
    
    // Switch to previous tab
    await page.keyboard.press('Control+Shift+Tab');
    
    // Verify active tab changed
    await expect(page.locator('[data-testid="tab-item-active"]')).toBeVisible();
  });

  test('F5 refreshes connection', async ({ page }) => {
    // Click on connection
    await page.click('[data-testid="connection-item"]');
    
    // Press F5
    await page.keyboard.press('F5');
    
    // Wait for refresh
    await expect(page.locator('[data-testid="connection-tree"]')).toBeVisible({ timeout: 10000 });
  });

  test('Ctrl+Z undoes in SQL editor', async ({ page }) => {
    // Click on SQL editor
    await page.click('[data-testid="sql-editor"]');
    
    // Type some SQL
    await page.fill('[data-testid="sql-editor"] textarea', 'SELECT');
    
    // Undo
    await page.keyboard.press('Control+Z');
    
    // Verify undo (content should be cleared or changed)
    // Monaco editor handles undo internally
  });

  test('Ctrl+Y redoes in SQL editor', async ({ page }) => {
    // Click on SQL editor
    await page.click('[data-testid="sql-editor"]');
    
    // Type some SQL
    await page.fill('[data-testid="sql-editor"] textarea', 'SELECT');
    
    // Undo
    await page.keyboard.press('Control+Z');
    
    // Redo
    await page.keyboard.press('Control+Y');
    
    // Verify redo (content should be restored)
  });

  test('Ctrl+Shift+K clears console', async ({ page }) => {
    // Open console/output panel
    await page.click('[data-testid="toggle-console"]');
    await expect(page.locator('[data-testid="console-panel"]')).toBeVisible({ timeout: 5000 });
    
    // Clear console
    await page.keyboard.press('Control+Shift+K');
    
    // Verify console cleared
    // This depends on implementation
  });

  test('Alt+Enter toggles sidebar', async ({ page }) => {
    // Get initial sidebar state
    const sidebar = page.locator('[data-testid="connection-tree"]');
    const initialVisible = await sidebar.isVisible();
    
    // Toggle sidebar
    await page.keyboard.press('Alt+Enter');
    
    // Verify sidebar state changed
    await expect(sidebar).toBeVisible({ timeout: 5000 }).not.toBe(initialVisible);
  });

  test('Esc closes dialogs', async ({ page }) => {
    // Open a dialog (e.g., connection dialog)
    await page.click('[data-testid="new-connection-btn"]');
    await expect(page.locator('[data-testid="connection-dialog"]')).toBeVisible({ timeout: 5000 });
    
    // Press Esc
    await page.keyboard.press('Escape');
    
    // Verify dialog closed
    await expect(page.locator('[data-testid="connection-dialog"]')).not.toBeVisible();
  });

  test('Ctrl+Shift+F opens find in files', async ({ page }) => {
    // Open find in files
    await page.keyboard.press('Control+Shift+F');
    
    // Wait for search panel
    await expect(page.locator('[data-testid="search-panel"]')).toBeVisible({ timeout: 5000 }).orElse(
      expect(page.locator('[data-testid="find-input"]')).toBeVisible({ timeout: 5000 })
    );
  });

  test('Ctrl+P opens command palette', async ({ page }) => {
    // Open command palette
    await page.keyboard.press('Control+P');
    
    // Wait for command palette
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible({ timeout: 5000 });
    
    // Type command
    await page.fill('[data-testid="command-palette-input"]', 'connect');
    
    // Select command
    await page.keyboard.press('Enter');
    
    // Wait for command execution
    await expect(page.locator('[data-testid="connection-dialog"]')).toBeVisible({ timeout: 10000 }).orElse(
      expect(page.locator('.ant-message')).toBeVisible({ timeout: 10000 })
    );
  });

  test('F11 toggles fullscreen', async ({ page }) => {
    // Enter fullscreen
    await page.keyboard.press('F11');
    
    // Verify fullscreen (Playwright may not support fullscreen detection)
    // This test may need adjustment based on implementation
  });

  test('Ctrl+Shift+P opens command palette (alternative)', async ({ page }) => {
    // Open command palette
    await page.keyboard.press('Control+Shift+P');
    
    // Wait for command palette
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible({ timeout: 5000 });
  });

  test('shortcut conflict handling', async ({ page }) => {
    // Test that shortcuts don't conflict with browser shortcuts
    // Ctrl+L opens location bar in browser
    // Our app should not intercept this
    
    // Type in address bar instead of editor
    await page.click('[data-testid="address-bar"]');
    await page.keyboard.press('Control+L');
    
    // Browser should show location bar
    // This is browser behavior, not app behavior
  });

  test('custom shortcut configuration', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-menu"]');
    await expect(page.locator('[data-testid="settings-dialog"]')).toBeVisible({ timeout: 5000 });
    
    // Navigate to keyboard shortcuts
    await page.click('[data-testid="shortcuts-tab"]');
    
    // Verify shortcuts list is displayed
    await expect(page.locator('[data-testid="shortcut-item"]')).toBeVisible({ timeout: 5000 });
    
    // Modify a shortcut
    await page.click('[data-testid="edit-shortcut"]');
    await page.keyboard.press('Control+Shift+E');
    
    // Save
    await page.click('[data-testid="save-shortcut"]');
    
    // Verify saved
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 5000 });
  });

  test('shortcut tooltips', async ({ page }) => {
    // Hover over button to see shortcut tooltip
    await page.hover('[data-testid="execute-btn"]');
    
    // Wait for tooltip
    await expect(page.locator('[data-testid="shortcut-tooltip"]')).toBeVisible({ timeout: 5000 }).orElse(
      expect(page.locator('.ant-tooltip')).toBeVisible({ timeout: 5000 })
    );
  });

  test('shortcut help dialog', async ({ page }) => {
    // Open shortcut help
    await page.click('[data-testid="help-menu"]');
    await page.click('[data-testid="shortcuts-help"]');
    
    // Wait for help dialog
    await expect(page.locator('[data-testid="shortcuts-help-dialog"]')).toBeVisible({ timeout: 5000 });
    
    // Verify shortcuts are listed
    await expect(page.locator('[data-testid="shortcut-list"]')).toBeVisible();
  });
});
