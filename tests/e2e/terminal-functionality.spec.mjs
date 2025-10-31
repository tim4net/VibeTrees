import { test, expect } from '@playwright/test';

/**
 * Terminal Functionality Tests
 *
 * Tests for the terminal flow control and UI fixes:
 * - Terminal sizing and fitting
 * - Tab switching and resize behavior
 * - Cursor visibility and focus
 * - Flow control under heavy output
 */

test.describe('Terminal Functionality', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('.sidebar', { timeout: 10000 });
  });

  test('should render terminals with correct dimensions', async ({ page }) => {
    // Wait for at least one worktree to be visible
    await page.waitForSelector('.worktree-item', { timeout: 10000 });

    // Get first worktree
    const worktree = page.locator('.worktree-item').first();
    const worktreeName = await worktree.getAttribute('data-worktree');

    console.log(`Testing worktree: ${worktreeName}`);

    // Click on the worktree to expand it
    await worktree.click();
    await page.waitForTimeout(500);

    // Find an AI terminal tab (Claude, Codex, or Shell)
    const aiTab = page.locator('.tab').filter({ hasText: /Claude|Codex|Shell/ }).first();

    if (await aiTab.count() === 0) {
      console.log('No AI terminal tabs found, skipping test');
      test.skip();
      return;
    }

    // Click on the AI terminal tab
    await aiTab.click();
    await page.waitForTimeout(1000); // Wait for terminal to initialize

    // Get the active terminal panel
    const activePanel = page.locator('.tab-content.active');
    await expect(activePanel).toBeVisible();

    // Get terminal wrapper dimensions
    const terminalWrapper = activePanel.locator('.terminal-wrapper');
    const wrapperBox = await terminalWrapper.boundingBox();

    console.log(`Terminal wrapper dimensions: ${wrapperBox.width}x${wrapperBox.height}`);

    // Verify terminal has reasonable dimensions (not squashed)
    expect(wrapperBox.width).toBeGreaterThan(400);
    expect(wrapperBox.height).toBeGreaterThan(200);

    // Check xterm.js terminal element exists
    const xtermElement = terminalWrapper.locator('.xterm');
    await expect(xtermElement).toBeVisible();

    // Get terminal dimensions from xterm classes
    const xtermBox = await xtermElement.boundingBox();
    console.log(`XTerm element dimensions: ${xtermBox.width}x${xtermBox.height}`);

    // Terminal should fill most of the wrapper
    expect(xtermBox.width).toBeGreaterThan(wrapperBox.width * 0.9);
    expect(xtermBox.height).toBeGreaterThan(wrapperBox.height * 0.8);
  });

  test('should maintain terminal size when switching tabs', async ({ page }) => {
    // Wait for worktrees
    await page.waitForSelector('.worktree-item', { timeout: 10000 });

    const worktree = page.locator('.worktree-item').first();
    await worktree.click();
    await page.waitForTimeout(500);

    // Find two different tabs to switch between
    const tabs = page.locator('.tab');
    const tabCount = await tabs.count();

    if (tabCount < 2) {
      console.log('Not enough tabs to test switching');
      test.skip();
      return;
    }

    // Get first tab (likely AI terminal)
    const firstTab = tabs.nth(0);
    const firstName = await firstTab.textContent();

    await firstTab.click();
    await page.waitForTimeout(1000);

    // Measure first terminal
    let activePanel = page.locator('.tab-content.active');
    let terminalWrapper = activePanel.locator('.terminal-wrapper');
    let firstBox = await terminalWrapper.boundingBox();

    console.log(`First tab (${firstName}) dimensions: ${firstBox.width}x${firstBox.height}`);

    // Switch to second tab
    const secondTab = tabs.nth(1);
    const secondName = await secondTab.textContent();

    await secondTab.click();
    await page.waitForTimeout(1000);

    // Measure second terminal
    activePanel = page.locator('.tab-content.active');
    terminalWrapper = activePanel.locator('.terminal-wrapper');
    let secondBox = await terminalWrapper.boundingBox();

    console.log(`Second tab (${secondName}) dimensions: ${secondBox.width}x${secondBox.height}`);

    // Switch back to first tab
    await firstTab.click();
    await page.waitForTimeout(1000);

    // Measure first terminal again
    activePanel = page.locator('.tab-content.active');
    terminalWrapper = activePanel.locator('.terminal-wrapper');
    let firstBoxAfter = await terminalWrapper.boundingBox();

    console.log(`First tab (${firstName}) after switch: ${firstBoxAfter.width}x${firstBoxAfter.height}`);

    // Verify dimensions are maintained (within 5% tolerance)
    expect(Math.abs(firstBoxAfter.width - firstBox.width)).toBeLessThan(firstBox.width * 0.05);
    expect(Math.abs(firstBoxAfter.height - firstBox.height)).toBeLessThan(firstBox.height * 0.05);

    // Verify terminal is not horizontally squashed (<100px would be ~10 chars)
    expect(firstBoxAfter.width).toBeGreaterThan(400);
  });

  test('should show cursor when switching back to terminal', async ({ page }) => {
    await page.waitForSelector('.worktree-item', { timeout: 10000 });

    const worktree = page.locator('.worktree-item').first();
    await worktree.click();
    await page.waitForTimeout(500);

    // Find AI terminal tab
    const aiTab = page.locator('.tab').filter({ hasText: /Claude|Codex|Shell/ }).first();

    if (await aiTab.count() === 0) {
      console.log('No AI terminal tabs found');
      test.skip();
      return;
    }

    await aiTab.click();
    await page.waitForTimeout(1000);

    // Check for cursor in the terminal
    const activePanel = page.locator('.tab-content.active');
    const cursor = activePanel.locator('.xterm-cursor-layer');

    // Cursor layer should exist
    await expect(cursor).toBeVisible();

    // Switch to another tab if available
    const tabs = page.locator('.tab');
    if (await tabs.count() > 1) {
      const otherTab = tabs.nth(1);
      await otherTab.click();
      await page.waitForTimeout(500);

      // Switch back
      await aiTab.click();
      await page.waitForTimeout(500);

      // Cursor should still be visible
      const cursorAfter = page.locator('.tab-content.active').locator('.xterm-cursor-layer');
      await expect(cursorAfter).toBeVisible();
    }
  });

  test('should handle terminal focus correctly', async ({ page }) => {
    await page.waitForSelector('.worktree-item', { timeout: 10000 });

    const worktree = page.locator('.worktree-item').first();
    await worktree.click();
    await page.waitForTimeout(500);

    const aiTab = page.locator('.tab').filter({ hasText: /Claude|Codex|Shell/ }).first();

    if (await aiTab.count() === 0) {
      console.log('No AI terminal tabs found');
      test.skip();
      return;
    }

    await aiTab.click();
    await page.waitForTimeout(1000);

    // Get the terminal textarea (xterm.js uses a hidden textarea for input)
    const activePanel = page.locator('.tab-content.active');
    const textarea = activePanel.locator('.xterm-helper-textarea');

    // Terminal textarea should exist
    await expect(textarea).toBeAttached();

    // Click on terminal to focus it
    const terminalWrapper = activePanel.locator('.terminal-wrapper');
    await terminalWrapper.click();
    await page.waitForTimeout(200);

    // Textarea should be focused
    await expect(textarea).toBeFocused();
  });

  test('should handle window resize correctly', async ({ page }) => {
    await page.waitForSelector('.worktree-item', { timeout: 10000 });

    const worktree = page.locator('.worktree-item').first();
    await worktree.click();
    await page.waitForTimeout(500);

    const aiTab = page.locator('.tab').filter({ hasText: /Claude|Codex|Shell/ }).first();

    if (await aiTab.count() === 0) {
      console.log('No AI terminal tabs found');
      test.skip();
      return;
    }

    await aiTab.click();
    await page.waitForTimeout(1000);

    // Measure initial size
    const activePanel = page.locator('.tab-content.active');
    const terminalWrapper = activePanel.locator('.terminal-wrapper');
    const initialBox = await terminalWrapper.boundingBox();

    console.log(`Initial terminal: ${initialBox.width}x${initialBox.height}`);

    // Resize window to a smaller size
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.waitForTimeout(1000); // Wait for ResizeObserver to trigger

    // Measure after resize
    const smallerBox = await terminalWrapper.boundingBox();
    console.log(`After resize: ${smallerBox.width}x${smallerBox.height}`);

    // Terminal should have resized to fit new dimensions
    expect(smallerBox.width).toBeLessThan(initialBox.width);
    expect(smallerBox.height).toBeLessThan(initialBox.height);

    // But should still be reasonably sized (not squashed)
    expect(smallerBox.width).toBeGreaterThan(300);
    expect(smallerBox.height).toBeGreaterThan(150);

    // Resize back to larger
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(1000);

    const largerBox = await terminalWrapper.boundingBox();
    console.log(`After resize back: ${largerBox.width}x${largerBox.height}`);

    // Should be close to initial size
    expect(Math.abs(largerBox.width - initialBox.width)).toBeLessThan(50);
    expect(Math.abs(largerBox.height - initialBox.height)).toBeLessThan(50);
  });

  test('should not have horizontally squashed terminals after rapid tab switching', async ({ page }) => {
    await page.waitForSelector('.worktree-item', { timeout: 10000 });

    const worktree = page.locator('.worktree-item').first();
    await worktree.click();
    await page.waitForTimeout(500);

    const tabs = page.locator('.tab');
    const tabCount = await tabs.count();

    if (tabCount < 2) {
      console.log('Not enough tabs for rapid switching test');
      test.skip();
      return;
    }

    // Rapidly switch between tabs multiple times
    for (let i = 0; i < 5; i++) {
      await tabs.nth(0).click();
      await page.waitForTimeout(200);
      await tabs.nth(1).click();
      await page.waitForTimeout(200);
    }

    // Switch to first tab and verify it's not squashed
    await tabs.nth(0).click();
    await page.waitForTimeout(1000);

    const activePanel = page.locator('.tab-content.active');
    const terminalWrapper = activePanel.locator('.terminal-wrapper');
    const finalBox = await terminalWrapper.boundingBox();

    console.log(`Final terminal after rapid switching: ${finalBox.width}x${finalBox.height}`);

    // Terminal should NOT be horizontally squashed
    // ~10 chars would be roughly 80-100px, so we check for > 400px
    expect(finalBox.width).toBeGreaterThan(400);
    expect(finalBox.height).toBeGreaterThan(200);
  });

  test('should handle heavy output without freezing', async ({ page }) => {
    await page.waitForSelector('.worktree-item', { timeout: 10000 });

    const worktree = page.locator('.worktree-item').first();
    await worktree.click();
    await page.waitForTimeout(500);

    // Find Shell terminal (safer for testing heavy output)
    const shellTab = page.locator('.tab').filter({ hasText: 'Shell' }).first();

    if (await shellTab.count() === 0) {
      console.log('No Shell terminal found');
      test.skip();
      return;
    }

    await shellTab.click();
    await page.waitForTimeout(1000);

    const activePanel = page.locator('.tab-content.active');
    const terminalWrapper = activePanel.locator('.terminal-wrapper');

    // Type a command that produces heavy output
    // Using 'yes' command limited to 1000 lines to test flow control
    await terminalWrapper.click(); // Focus
    await page.keyboard.type('yes "Testing flow control with heavy output" | head -n 1000');
    await page.keyboard.press('Enter');

    // Wait for output to start
    await page.waitForTimeout(500);

    // UI should still be responsive - try clicking another tab
    const tabs = page.locator('.tab');
    if (await tabs.count() > 1) {
      const otherTab = tabs.nth(0);
      await otherTab.click();

      // Should switch successfully without hanging
      const otherPanel = page.locator('.tab-content.active');
      await expect(otherPanel).toBeVisible();

      // Switch back
      await shellTab.click();

      // Terminal should still be visible and responsive
      await expect(activePanel).toBeVisible();
    }

    // Wait for command to complete
    await page.waitForTimeout(2000);

    // Terminal should still have correct dimensions
    const finalBox = await terminalWrapper.boundingBox();
    expect(finalBox.width).toBeGreaterThan(400);
    expect(finalBox.height).toBeGreaterThan(200);
  });

  test('should maintain connection through WebSocket reconnections', async ({ page }) => {
    await page.waitForSelector('.worktree-item', { timeout: 10000 });

    // Check WebSocket connection indicator
    const wsIndicator = page.locator('#ws-connection .ws-indicator');
    await expect(wsIndicator).toBeVisible();

    // Should be in 'connected' state
    const state = await wsIndicator.getAttribute('data-state');
    expect(state).toBe('connected');

    // Verify connection is stable for a few seconds
    await page.waitForTimeout(3000);

    const stateAfter = await wsIndicator.getAttribute('data-state');
    expect(stateAfter).toBe('connected');
  });
});
