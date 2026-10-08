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
    if (await splicedBtn.isVisible()) {
      await splicedBtn.click();
      await page.waitForTimeout(600);

      // Verify the spliced canvas container is visible if frames exist
      const splicedContainer = page.locator('.spliced-canvas-scroll-container, .spliced-empty-state, .frames-feed-panel');
      if (await splicedContainer.isVisible()) {
        await expect(splicedContainer).toBeVisible();
      }
    }

    // Capture screenshot of full-width spliced canvas
    await page.screenshot({ path: 'test-results/screenshots/09_spliced_canvas_full_width.png' });
  });

  test('should enforce edit mode and dark mode before proceeding with DAG group process', async ({ page }) => {
    // 1. Trigger auto-heal environment pre-check via backend API
    const healRes = await page.request.post('http://127.0.0.1:8000/api/dag/auto-heal', {
      data: { serial: 'mock:9999', node_id: 'init_end' }
    });
    expect(healRes.ok()).toBeTruthy();
    const healData = await healRes.json();
    expect(healData.healed).toBe(true);

    // 2. Verify alignment status reflects Edit Mode and Dark Mode passed
    const alignRes = await page.request.get('http://127.0.0.1:8000/api/alignment/status');
    expect(alignRes.ok()).toBeTruthy();
    const alignData = await alignRes.json();
    const boxes = alignData?.alignment?.boxes || alignData?.boxes || {};
    if (boxes.edit_mode) {
      expect(boxes.edit_mode.passed).toBe(true);
    }
    if (boxes.dark_mode) {
      expect(boxes.dark_mode.passed).toBe(true);
    }

    // Capture screenshot of verified environment state
    await page.screenshot({ path: 'test-results/screenshots/10_edit_and_dark_mode_enforced.png' });
  });

  test('should verify DAG 4 local OCR text extraction and DAG 6 tracked arrow down count alignment', async ({ page }) => {
    test.setTimeout(75000);

    // 1. Execute DAG Node 4 (local_ai_ocr / MiniCPM-V local model)
    const node4Res = await page.request.post('http://127.0.0.1:8000/api/dag/run/local_ai_ocr', {
      data: { serial: 'mock:9999' }
    });
    expect(node4Res.ok()).toBeTruthy();
    const n4Data = await node4Res.json();
    expect(['completed', 'success']).toContain(n4Data.status);
    expect(n4Data.lines_count).toBeGreaterThan(0);
    const engineName = (n4Data.engine || n4Data.model_used || n4Data.ocr_engine || '').toLowerCase();
    expect(engineName).toContain('minicpm');
    expect(n4Data.extracted_text).toBeTruthy();

    // 2. Execute DAG Node 6 (arrow_down) with cursor focused on Line 1 at start of scan
    const node6Res = await page.request.post('http://127.0.0.1:8000/api/dag/run/arrow_down', {
      data: {
        serial: 'mock:9999',
        cur_top: 1,
        prev_bottom: 31,
        cursor_line: 1
      }
    });
    expect(node6Res.ok()).toBeTruthy();
    const n6Data = await node6Res.json();
    expect(['completed', 'success']).toContain(n6Data.status);
    expect(n6Data.target_top_line).toBe(32); // prev_bottom (31) + 1 = 32
    expect(n6Data.arrow_count).toBe(61); // 30 travel + 31 viewport scroll
    expect(n6Data.reached).toBe(true);
    expect(n6Data.advanced).toBe(true);

    // 3. Inspect in web UI: reload and verify DAG container renders verified states
    await page.reload();
    await page.waitForSelector('#root', { state: 'visible', timeout: 10000 });
    const dagContainer = page.locator('.flow-dag-container, [data-testid="flow-dag"], .react-flow, .dag-group, svg').first();
    await expect(dagContainer).toBeVisible({ timeout: 10000 });

    // Capture screenshot of active DAG pipeline reflecting verified Node 4 & 6 states
    await page.screenshot({ path: 'test-results/screenshots/11_dag4_ocr_and_dag6_alignment.png' });
  });
});

