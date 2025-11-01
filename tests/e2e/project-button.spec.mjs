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

  test('Browse button should show directory suggestions and fill input', async ({ page }) => {
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

    // Check that /api/system/home endpoint works
    const homeResponse = await page.evaluate(async () => {
      const response = await fetch('/api/system/home');
      return response.json();
    });
    expect(homeResponse).toHaveProperty('home');
    expect(homeResponse.home).toBeTruthy();
    console.log('✓ /api/system/home endpoint works, home:', homeResponse.home);

    // Set up dialog handler to accept the alert
    const dialogPromise = page.waitForEvent('dialog');

    // Click the Browse button
    await browseButton.click();

    // Wait for and handle the dialog
    const dialog = await dialogPromise;
    console.log('Alert message:', dialog.message());
    expect(dialog.message()).toContain('Common project directories:');
    await dialog.accept();
    console.log('✓ Browse button clicked and alert handled');

    // Wait for the input to be filled (the code runs after alert is dismissed)
    await page.waitForTimeout(500);

    // Verify the path input is filled with ~/code
    const pathInput = page.locator('#new-project-path');
    const pathValue = await pathInput.inputValue();
    expect(pathValue).toContain('/code');
    console.log('✓ Path input filled with:', pathValue);

    // Verify input is selected (focused)
    const isFocused = await pathInput.evaluate(el => el === document.activeElement);
    expect(isFocused).toBe(true);
    console.log('✓ Path input is focused and selected');
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
