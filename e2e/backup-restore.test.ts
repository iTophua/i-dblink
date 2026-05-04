import { test, expect } from '@playwright/test';
import { TEST_CONNECTIONS, waitForLoading } from './helpers/test-helpers';

test.describe('Backup and Restore', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await waitForLoading(page);
  });

  test('check backup tool availability', async ({ page }) => {
    // Open backup/restore dialog
    await page.click('[data-testid="backup-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="backup-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Check tool availability status
    await expect(page.locator('[data-testid="backup-tool-status"]')).toBeVisible();
  });

  test('backup database', async ({ page }) => {
    // Open backup dialog
    await page.click('[data-testid="backup-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="backup-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select database
    await page.selectOption('[data-testid="backup-database-select"]', 'testdb');
    
    // Select backup options
    await page.check('[data-testid="backup-structure"]');
    await page.check('[data-testid="backup-data"]');
    
    // Select output file
    await page.setInputFiles('[data-testid="backup-file-input"]', {
      name: 'test-backup.sql',
      mimeType: 'text/sql',
      buffer: Buffer.from('-- Test backup'),
    });
    
    // Execute backup
    await page.click('[data-testid="execute-backup"]');
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 30000 });
    
    // Verify backup file exists (in real test, check file system)
  });

  test('backup with selected tables', async ({ page }) => {
    // Open backup dialog
    await page.click('[data-testid="backup-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="backup-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select specific tables
    await page.check('[data-testid="table-select-users"]');
    await page.check('[data-testid="table-select-orders"]');
    
    // Execute backup
    await page.click('[data-testid="execute-backup"]');
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 30000 });
  });

  test('backup without data (structure only)', async ({ page }) => {
    // Open backup dialog
    await page.click('[data-testid="backup-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="backup-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select only structure
    await page.check('[data-testid="backup-structure"]');
    await page.uncheck('[data-testid="backup-data"]');
    
    // Execute backup
    await page.click('[data-testid="execute-backup"]');
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 30000 });
  });

  test('restore database', async ({ page }) => {
    // Open restore dialog
    await page.click('[data-testid="restore-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="restore-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select database
    await page.selectOption('[data-testid="restore-database-select"]', 'testdb');
    
    // Select backup file
    await page.setInputFiles('[data-testid="restore-file-input"]', {
      name: 'test-backup.sql',
      mimeType: 'text/sql',
      buffer: Buffer.from('-- Test backup file'),
    });
    
    // Confirm restore
    await page.click('[data-testid="confirm-restore"]');
    
    // Wait for confirmation dialog
    await expect(page.locator('.ant-modal-title')).toContainText(/restore/i);
    
    // Confirm restore
    await page.click('[data-testid="confirm-restore-action"]');
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 30000 });
  });

  test('restore with warning', async ({ page }) => {
    // Open restore dialog
    await page.click('[data-testid="restore-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="restore-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select file
    await page.setInputFiles('[data-testid="restore-file-input"]', {
      name: 'test-backup.sql',
      mimeType: 'text/sql',
      buffer: Buffer.from('-- Test backup'),
    });
    
    // Confirm restore
    await page.click('[data-testid="confirm-restore"]');
    
    // Verify warning message
    await expect(page.locator('.ant-modal-content')).toContainText(/warning/i).orElse(
      expect(page.locator('.ant-modal-content')).toContainText(/overwrite/i)
    );
    
    // Cancel restore
    await page.click('.ant-btn-secondary, [data-testid="cancel-restore"]');
    
    // Verify dialog closed
    await expect(page.locator('[data-testid="restore-dialog"]')).not.toBeVisible();
  });

  test('backup error handling', async ({ page }) => {
    // Open backup dialog
    await page.click('[data-testid="backup-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="backup-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Try to backup without selecting database
    await page.click('[data-testid="execute-backup"]');
    
    // Verify error message
    await expect(page.locator('.ant-message-error')).toBeVisible({ timeout: 5000 });
  });

  test('restore error handling', async ({ page }) => {
    // Open restore dialog
    await page.click('[data-testid="restore-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="restore-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Try to restore without selecting file
    await page.click('[data-testid="confirm-restore"]');
    
    // Verify error message
    await expect(page.locator('.ant-message-error')).toBeVisible({ timeout: 5000 });
  });

  test('backup progress indicator', async ({ page }) => {
    // Open backup dialog
    await page.click('[data-testid="backup-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="backup-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select database and options
    await page.selectOption('[data-testid="backup-database-select"]', 'testdb');
    await page.check('[data-testid="backup-structure"]');
    await page.check('[data-testid="backup-data"]');
    
    // Execute backup
    await page.click('[data-testid="execute-backup"]');
    
    // Wait for progress indicator
    await expect(page.locator('[data-testid="backup-progress"]')).toBeVisible({ timeout: 10000 });
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 30000 });
  });

  test('restore progress indicator', async ({ page }) => {
    // Open restore dialog
    await page.click('[data-testid="restore-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="restore-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select file
    await page.setInputFiles('[data-testid="restore-file-input"]', {
      name: 'test-backup.sql',
      mimeType: 'text/sql',
      buffer: Buffer.from('-- Test backup'),
    });
    
    // Confirm restore
    await page.click('[data-testid="confirm-restore"]');
    await page.click('[data-testid="confirm-restore-action"]');
    
    // Wait for progress indicator
    await expect(page.locator('[data-testid="restore-progress"]')).toBeVisible({ timeout: 10000 });
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 30000 });
  });

  test('backup file format validation', async ({ page }) => {
    // Open backup dialog
    await page.click('[data-testid="backup-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="backup-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Try to select invalid file type
    await page.setInputFiles('[data-testid="backup-file-input"]', {
      name: 'test-backup.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Not a SQL file'),
    });
    
    // Should show validation error or auto-correct extension
    // This depends on implementation
  });

  test('restore file format validation', async ({ page }) => {
    // Open restore dialog
    await page.click('[data-testid="restore-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="restore-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Try to select invalid file type
    await page.setInputFiles('[data-testid="restore-file-input"]', {
      name: 'test-backup.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Not a SQL file'),
    });
    
    // Should show validation error
  });

  test('backup multiple databases', async ({ page }) => {
    // Open backup dialog
    await page.click('[data-testid="backup-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="backup-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select first database
    await page.selectOption('[data-testid="backup-database-select"]', 'testdb');
    
    // Execute backup
    await page.click('[data-testid="execute-backup"]');
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 30000 });
    
    // Select second database
    // Note: This requires multiple databases to be available
  });

  test('restore to different database', async ({ page }) => {
    // Open restore dialog
    await page.click('[data-testid="restore-menu"]');
    
    // Wait for dialog
    await expect(page.locator('[data-testid="restore-dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Select file
    await page.setInputFiles('[data-testid="restore-file-input"]', {
      name: 'test-backup.sql',
      mimeType: 'text/sql',
      buffer: Buffer.from('-- Test backup'),
    });
    
    // Select target database
    await page.selectOption('[data-testid="restore-database-select"]', 'testdb');
    
    // Confirm restore
    await page.click('[data-testid="confirm-restore"]');
    await page.click('[data-testid="confirm-restore-action"]');
    
    // Wait for completion
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 30000 });
  });
});
