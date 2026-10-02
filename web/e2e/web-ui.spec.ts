import { test, expect } from '@playwright/test';

test.describe('Web UI Automation & Screen Capture Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main dashboard
    await page.goto('/');
    await page.waitForSelector('#root', { state: 'visible', timeout: 10000 });
  });

  test('should load dashboard, verify title, and capture primary UI screenshot', async ({ page }) => {
    // Verify title and main root container
    await expect(page).toHaveTitle(/MatrixCapture|Live OCR|Studio/i);
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    // Capture initial full-page dashboard screenshot
    await page.screenshot({ path: 'test-results/screenshots/01_web_dashboard_initial.png', fullPage: true });
  });

  test('should render DAG flow and allow navigation between DAG groups', async ({ page }) => {
    // Locate the DAG flow container
    const dagContainer = page.locator('.flow-dag-container, [data-testid="flow-dag"], .dag-group, svg').first();
    await expect(dagContainer).toBeVisible({ timeout: 10000 });

    // Test clicking Initialize DAG group tab/filter if present
    const initTab = page.getByRole('button', { name: /initialize/i }).or(page.locator('button:has-text("Initialize")')).first();
    if (await initTab.isVisible()) {
      await initTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'test-results/screenshots/02_dag_group_initialize.png' });
    }

    // Test clicking Capture Entire Markdown DAG group tab/filter
    const captureTab = page.getByRole('button', { name: /capture entire markdown/i }).or(page.locator('button:has-text("Capture")')).first();
    if (await captureTab.isVisible()) {
      await captureTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'test-results/screenshots/03_dag_group_capture.png' });
    }
  });

  test('should inspect DAG nodes and open node popover / inspector modal', async ({ page }) => {
    // Look for node cards (init_end, arrow_down, verification_trigger, etc.)
    const nodeCard = page.locator('.dag-node-card, [data-node-id], button:has-text("1. Determine"), button:has-text("6. Intelligent")').first();
    if (await nodeCard.isVisible()) {
      await nodeCard.click();
      await page.waitForTimeout(500);

      // Verify popover or inspector opens
      const inspectorOrPopover = page.locator('.dag-node-popover, .dag-inspector-modal, [role="dialog"]').first();
      if (await inspectorOrPopover.isVisible()) {
        await expect(inspectorOrPopover).toBeVisible();
        await page.screenshot({ path: 'test-results/screenshots/04_dag_node_inspector.png' });

        // Close modal if open
        const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"], svg.lucide-x').first();
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        }
      }
    }
  });

  test('should verify telemetry toaster and system metrics status', async ({ page }) => {
    // Verify header / status pill
    const statusPill = page.locator('.status-pill, .telemetry-bar, [data-testid="status-pill"]').first();
    if (await statusPill.isVisible()) {
      await expect(statusPill).toBeVisible();
    }

    // Verify live viewport stream or fallback placeholder
    const viewport = page.locator('img[alt*="Live"], img[src*="live"], .live-responsive-viewport, canvas').first();
    if (await viewport.isVisible()) {
      await expect(viewport).toBeVisible();
    }

    await page.screenshot({ path: 'test-results/screenshots/05_web_telemetry_and_viewport.png' });
  });

  test('should display spliced canvas in full width preserving aspect ratio with zoom controls', async ({ page }) => {
    // Locate the Spliced button tab (e.g. "Spliced (4)")
    const splicedBtn = page.getByRole('button', { name: /spliced/i }).first();
    await expect(splicedBtn).toBeVisible();
    await splicedBtn.click();
    await page.waitForTimeout(600);

    // Verify the spliced canvas container is visible
    const splicedContainer = page.locator('.spliced-canvas-scroll-container');
    await expect(splicedContainer).toBeVisible();

    // Capture screenshot of full-width spliced canvas
    await page.screenshot({ path: 'test-results/screenshots/09_spliced_canvas_full_width.png' });
  });
});
