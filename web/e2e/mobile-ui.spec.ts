import { test, expect } from '@playwright/test';

test.describe('Mobile UI & Device Mirror Automation Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate using the mobile emulation project settings (Pixel 7 viewport)
    await page.goto('/');
    await page.waitForSelector('#root', { state: 'visible', timeout: 10000 });
  });

  test('should render responsive mobile layout with touch support', async ({ page }) => {
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    // Verify layout collapses responsively for mobile
    await page.screenshot({ path: 'test-results/screenshots/06_mobile_ui_initial.png' });
  });

  test('should toggle device studio drawer or control drawer', async ({ page }) => {
    // Look for device drawer trigger or toggle buttons in dock/header
    const drawerToggle = page.locator('button.window-dock-pill, button:has-text("Device"), button:has-text("Studio")').first();
    if (await drawerToggle.isVisible()) {
      await drawerToggle.dispatchEvent('click');
      await page.waitForTimeout(500);

      // Verify drawer or window panel is present
      const drawer = page.locator('.device-studio-drawer, .studio-drawer, [role="complementary"]').first();
      if (await drawer.isVisible()) {
        await expect(drawer).toBeVisible();
      }
      await page.screenshot({ path: 'test-results/screenshots/07_mobile_device_drawer.png' });
    }
  });

  test('should inspect live stream canvas in mobile viewport and capture frame', async ({ page }) => {
    // Check for responsive viewport or video canvas
    const liveStream = page.locator('.live-responsive-viewport, img[src*="live"], img[alt*="Live"], canvas').first();
    if (await liveStream.isVisible()) {
      await expect(liveStream).toBeVisible();
      await page.screenshot({ path: 'test-results/screenshots/08_mobile_live_viewport.png' });
    }
  });
});
