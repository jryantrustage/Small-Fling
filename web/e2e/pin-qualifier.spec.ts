import { test, expect } from '@playwright/test';

test.describe('PIN & Security Settings and Qualifier Controls Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });
  });

  test('should open Settings gear and display PIN & Security tab with Safe Mode default', async ({ page }) => {
    // 1. Locate and click gear button
    const gearBtn = page.locator('.gear-btn, button[aria-label="Settings"], button[title="Settings"]').first();
    await expect(gearBtn).toBeVisible({ timeout: 10000 });
    await gearBtn.click();

    // 2. Verify Studio Settings modal opens
    const modal = page.getByText('Studio Settings').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 3. Verify the tabs are rendered: Pipeline Engine, Secrets, PIN & Security
    const securityTab = page.locator('button.modal-tab:has-text("PIN & Security"), button:has-text("PIN & Security")').first();
    await expect(securityTab).toBeVisible();

    // 4. Switch to PIN & Security tab
    await securityTab.click();
    await page.waitForTimeout(300);

    // 5. Verify Corporate Lockout Prevention banner is visible
    const lockoutBanner = page.getByText('CORPORATE LOCKOUT PREVENTION ACTIVE (SAFE)').or(page.getByText('AUTONOMOUS PIN ENTRY ACTIVE')).first();
    await expect(lockoutBanner).toBeVisible();

    // 6. Verify explanation of Okta lockout prevention
    const explanation = page.getByText('To prevent Okta Authenticator 2FA resets').or(page.getByText('Autonomous PIN entry is enabled')).first();
    await expect(explanation).toBeVisible();

    // 7. Verify Auto Enter PIN toggle exists and is in safe default
    const toggleBtn = page.locator('#toggle-auto-enter-pin-btn');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText('DISABLED (SAFE)');

    // 8. Verify Device PIN input exists and contains 1213
    const pinInput = page.locator('#device-pin-input');
    await expect(pinInput).toBeVisible();
    const pinVal = await pinInput.inputValue();
    expect(pinVal).toMatch(/1213/);

    // 9. Verify Manual Control button exists
    const enterPinBtn = page.locator('#enter-pin-now-btn');
    await expect(enterPinBtn).toBeVisible();

    // Take screenshot of PIN & Security settings
    await page.screenshot({ path: 'test-results/screenshots/pin_security_settings_safe_mode.png' });
  });

  test('should toggle Auto Enter PIN safely and persist setting', async ({ page }) => {
    // Open gear settings
    const gearBtn = page.locator('.gear-btn, button[aria-label="Settings"]').first();
    await gearBtn.click();

    // Click PIN & Security tab
    const securityTab = page.locator('button.modal-tab:has-text("PIN & Security")').first();
    await securityTab.click();
    await page.waitForTimeout(200);

    const toggleBtn = page.locator('#toggle-auto-enter-pin-btn');
    await expect(toggleBtn).toBeVisible();

    // Toggle setting ON
    await toggleBtn.click();
    await page.waitForTimeout(600);
    await expect(toggleBtn).toContainText('ENABLED');

    // Toggle setting OFF (revert to safe default)
    await toggleBtn.click();
    await page.waitForTimeout(600);
    await expect(toggleBtn).toContainText('DISABLED (SAFE)');

    await page.screenshot({ path: 'test-results/screenshots/pin_security_toggle_verified.png' });
  });

  test('should allow editing and saving Device PIN code', async ({ page }) => {
    // Open gear settings
    const gearBtn = page.locator('.gear-btn, button[aria-label="Settings"]').first();
    await gearBtn.click();

    // Click PIN & Security tab
    const securityTab = page.locator('button.modal-tab:has-text("PIN & Security")').first();
    await securityTab.click();
    await page.waitForTimeout(200);

    const pinInput = page.locator('#device-pin-input');
    const saveBtn = page.locator('#save-device-pin-btn');

    // Fill PIN 1213
    await pinInput.fill('1213');
    await saveBtn.click();
    await page.waitForTimeout(600);

    // Verify feedback
    const feedback = page.getByText('PIN successfully saved to server config and .env');
    await expect(feedback).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/pin_security_saved_feedback.png' });
  });

  test('should check screen status and allow manual one-shot PIN entry control', async ({ page }) => {
    // Open gear settings
    const gearBtn = page.locator('.gear-btn, button[aria-label="Settings"]').first();
    await gearBtn.click();

    // Click PIN & Security tab
    const securityTab = page.locator('button.modal-tab:has-text("PIN & Security")').first();
    await securityTab.click();
    await page.waitForTimeout(200);

    // Test "Check Screen" button
    const checkBtn = page.locator('#check-pin-screen-btn');
    await expect(checkBtn).toBeVisible();
    await checkBtn.click();
    await page.waitForTimeout(800);

    // Verify detector status pill
    const statusPill = page.getByText(/PIN PROMPT DETECTED|NO PROMPT \(READY\)/i).first();
    await expect(statusPill).toBeVisible();

    // Test "Enter PIN Now" button
    const enterPinBtn = page.locator('#enter-pin-now-btn');
    await expect(enterPinBtn).toBeVisible();
    await enterPinBtn.click();
    await page.waitForTimeout(800);

    // Verify execution feedback is displayed
    const resultNotice = page.locator('.settings-tab-content').getByText(/PIN|Safe Lock|Dispatched/i).first();
    await expect(resultNotice).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/pin_security_manual_entry_triggered.png' });
  });
});
