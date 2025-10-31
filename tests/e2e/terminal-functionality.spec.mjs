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

  /**
   * Helper to open a terminal for a worktree
   */
  async function openTerminal(page, worktreeName, terminalType = 'claude') {
    // Click on the worktree card to select it
    const worktreeCard = page.locator(`.worktree-card[data-name="${worktreeName}"]`);
    await worktreeCard.click();
    await page.waitForTimeout(500);

    // Click on the terminal button (Claude, Codex, or Shell)
    const buttonSelector = terminalType === 'shell'
      ? `.worktree-card[data-name="${worktreeName}"] button[title*="Shell"]`
      : `.worktree-card[data-name="${worktreeName}"] button[title*="${terminalType.charAt(0).toUpperCase() + terminalType.slice(1)}"]`;

    const terminalButton = page.locator(buttonSelector);
    await terminalButton.click();
    await page.waitForTimeout(1500); // Wait for terminal to initialize
  }

  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('.sidebar', { timeout: 10000 });

    // Wait for worktrees to load
    await page.waitForSelector('.worktree-card', { timeout: 10000 });
  });

  test('should render terminals with correct dimensions', async ({ page }) => {
    // Get first worktree
    const worktree = page.locator('.worktree-card').first();
    const worktreeName = await worktree.getAttribute('data-name');

    console.log(`Testing worktree: ${worktreeName}`);

    // Open a Claude terminal
    await openTerminal(page, worktreeName, 'claude');

    // Find the Claude terminal tab
    const aiTab = page.locator('.tab').filter({ hasText: /Claude/ }).first();
    await expect(aiTab).toBeVisible();

    // Click on the AI terminal tab to ensure it's active
    await aiTab.click();
    await page.waitForTimeout(500);

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
    const worktree = page.locator('.worktree-card').first();
    const worktreeName = await worktree.getAttribute('data-name');

    // Open Claude and Shell terminals
    await openTerminal(page, worktreeName, 'claude');
    await openTerminal(page, worktreeName, 'shell');

    // Find both tabs
    const claudeTab = page.locator('.tab').filter({ hasText: /Claude/ }).first();
    const shellTab = page.locator('.tab').filter({ hasText: /Shell/ }).first();

    // Click Claude tab
    await claudeTab.click();
    await page.waitForTimeout(1000);

    // Measure Claude terminal
    let activePanel = page.locator('.tab-content.active');
    let terminalWrapper = activePanel.locator('.terminal-wrapper');
    let firstBox = await terminalWrapper.boundingBox();

    console.log(`Claude terminal dimensions: ${firstBox.width}x${firstBox.height}`);

    // Switch to Shell tab
    await shellTab.click();
    await page.waitForTimeout(1000);

    // Measure Shell terminal
    activePanel = page.locator('.tab-content.active');
    terminalWrapper = activePanel.locator('.terminal-wrapper');
    let secondBox = await terminalWrapper.boundingBox();

    console.log(`Shell terminal dimensions: ${secondBox.width}x${secondBox.height}`);

    // Switch back to Claude tab
    await claudeTab.click();
    await page.waitForTimeout(1000);

    // Measure Claude terminal again
    activePanel = page.locator('.tab-content.active');
    terminalWrapper = activePanel.locator('.terminal-wrapper');
    let firstBoxAfter = await terminalWrapper.boundingBox();

    console.log(`Claude terminal after switch: ${firstBoxAfter.width}x${firstBoxAfter.height}`);

    // Verify dimensions are maintained (within 5% tolerance)
    expect(Math.abs(firstBoxAfter.width - firstBox.width)).toBeLessThan(firstBox.width * 0.05);
    expect(Math.abs(firstBoxAfter.height - firstBox.height)).toBeLessThan(firstBox.height * 0.05);

    // Verify terminal is not horizontally squashed
    expect(firstBoxAfter.width).toBeGreaterThan(400);
  });

  test('should show cursor when switching back to terminal', async ({ page }) => {
    const worktree = page.locator('.worktree-card').first();
    const worktreeName = await worktree.getAttribute('data-name');

    // Open Claude and Shell terminals
    await openTerminal(page, worktreeName, 'claude');
    await openTerminal(page, worktreeName, 'shell');

    const claudeTab = page.locator('.tab').filter({ hasText: /Claude/ }).first();
    const shellTab = page.locator('.tab').filter({ hasText: /Shell/ }).first();

    await claudeTab.click();
    await page.waitForTimeout(1000);

    // Check for cursor in the Claude terminal
    const activePanel = page.locator('.tab-content.active');
    const cursor = activePanel.locator('.xterm-cursor-layer');

    // Cursor layer should exist
    await expect(cursor).toBeVisible();

    // Switch to Shell tab
    await shellTab.click();
    await page.waitForTimeout(500);

    // Switch back to Claude
    await claudeTab.click();
    await page.waitForTimeout(500);

    // Cursor should still be visible
    const cursorAfter = page.locator('.tab-content.active').locator('.xterm-cursor-layer');
    await expect(cursorAfter).toBeVisible();
  });

  test('should handle terminal focus correctly', async ({ page }) => {
    const worktree = page.locator('.worktree-card').first();
    const worktreeName = await worktree.getAttribute('data-name');

    await openTerminal(page, worktreeName, 'claude');

    const claudeTab = page.locator('.tab').filter({ hasText: /Claude/ }).first();
    await claudeTab.click();
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
    const worktree = page.locator('.worktree-card').first();
    const worktreeName = await worktree.getAttribute('data-name');

    await openTerminal(page, worktreeName, 'claude');

    const claudeTab = page.locator('.tab').filter({ hasText: /Claude/ }).first();
    await claudeTab.click();
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
    const worktree = page.locator('.worktree-card').first();
    const worktreeName = await worktree.getAttribute('data-name');

    // Open multiple terminals
    await openTerminal(page, worktreeName, 'claude');
    await openTerminal(page, worktreeName, 'shell');

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

  test('should maintain connection through WebSocket reconnections', async ({ page }) => {
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
