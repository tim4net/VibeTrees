import { test, expect } from '@playwright/test';

test.describe('Project Management UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3336');
    await page.waitForLoadState('networkidle');
  });

  test('New Project button should be visible and clickable', async ({ page }) => {
    // Find the +New button
    const newButton = page.locator('button:has-text("+New")');
    
    // Verify button exists and is visible
    await expect(newButton).toBeVisible();
    console.log('✓ Button is visible');
    
    // Check if showNewProjectModal function exists in window
    const functionExists = await page.evaluate(() => {
      return typeof window.showNewProjectModal === 'function';
    });
    console.log('Function exists:', functionExists);
    expect(functionExists).toBe(true);
    
    // Verify modal is not visible initially
    const modal = page.locator('#new-project-modal');
    await expect(modal).not.toHaveClass(/active/);
    console.log('✓ Modal is hidden initially');

    // Click the button
    await newButton.click();
    console.log('✓ Button clicked');

    // Wait a bit for modal to appear
    await page.waitForTimeout(500);

    // Verify modal is now visible
    await expect(modal).toHaveClass(/active/);
    console.log('✓ Modal is now active');
    
    // Verify modal content
    await expect(page.locator('#new-project-modal h2')).toContainText('Add New Project');
    await expect(page.locator('#new-project-name')).toBeVisible();
    await expect(page.locator('#new-project-path')).toBeVisible();
  });

  test('Browse button functionality and API endpoint', async ({ page, context }) => {
    // Open the modal first
    const newButton = page.locator('button:has-text("+New")');
    await newButton.click();
    await page.waitForTimeout(500);

    const modal = page.locator('#new-project-modal');
    await expect(modal).toHaveClass(/active/);
    console.log('✓ Modal is open');

    // Find the Browse button
    const browseButton = page.locator('button:has-text("Browse")');
    await expect(browseButton).toBeVisible();
    console.log('✓ Browse button is visible');

    // Check if browseForProjectPath function exists
    const functionExists = await page.evaluate(() => {
      return typeof window.browseForProjectPath === 'function';
    });
    expect(functionExists).toBe(true);
    console.log('✓ browseForProjectPath function exists');

    // Test the /api/system/find-directory endpoint
    const testResponse = await page.evaluate(async () => {
      const response = await fetch('/api/system/find-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'vibe-worktrees' })
      });
      return {
        status: response.status,
        data: await response.json()
      };
    });

    // Endpoint should return either 200 (found) or 404 (not found)
    expect([200, 404]).toContain(testResponse.status);

    if (testResponse.status === 200) {
      expect(testResponse.data).toHaveProperty('path');
      expect(testResponse.data.path).toContain('vibe-worktrees');
      console.log('✓ /api/system/find-directory found:', testResponse.data.path);
    } else {
      expect(testResponse.data).toHaveProperty('error');
      expect(testResponse.data).toHaveProperty('searched');
      console.log('✓ /api/system/find-directory returned 404 (directory not in common locations)');
      console.log('  Searched paths:', testResponse.data.searched.length, 'locations');
    }

    // Note: We cannot test the actual native file picker in Playwright
    // as it's an OS-level dialog that Playwright cannot interact with.
    // The file picker would require user interaction to select a directory.

    // Instead, we verify the function exists and the backend API works correctly.
    console.log('✓ Native file picker would open on click (cannot be automated)');
  });

  test('Debug: Check what happens on click', async ({ page }) => {
    // Set up console logging
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    const newButton = page.locator('button:has-text("+New")');

    // Log button properties
    const buttonInfo = await newButton.evaluate(el => ({
      onclick: el.getAttribute('onclick'),
      visible: el.offsetParent !== null,
      disabled: el.disabled,
      class: el.className
    }));
    console.log('Button info:', buttonInfo);

    // Check window object
    const windowCheck = await page.evaluate(() => ({
      showNewProjectModal: typeof window.showNewProjectModal,
      modal: document.getElementById('new-project-modal') !== null
    }));
    console.log('Window check:', windowCheck);

    // Try clicking
    await newButton.click();
    await page.waitForTimeout(1000);

    // Check modal state after click
    const modalState = await page.evaluate(() => {
      const modal = document.getElementById('new-project-modal');
      return {
        exists: modal !== null,
        classes: modal?.className,
        display: modal ? window.getComputedStyle(modal).display : null
      };
    });
    console.log('Modal state after click:', modalState);
  });
});
