import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';

test.describe('Project Lifecycle & Deletion Suite with 15 Captures', () => {
  let createdProjectId: string = '';
  let projectName: string = 'Matrix_15_Captures_Delete_Test';

  test.beforeAll(async () => {
    const serverDir = path.resolve('..', 'server');
    const pyScript = `
import sys, json, urllib.request
from pathlib import Path
from PIL import Image
sys.path.insert(0, r"${serverDir}")
import db, config
for existing in db.get_projects():
    if existing.get("name") == "Matrix_15_Captures_Delete_Test":
        db.delete_project(existing["id"])
p = db.create_project("Matrix_15_Captures_Delete_Test", "E2E test project", 450)
pid = p["id"]
db.activate_project(pid)
frames_dir = Path(config.FRAMES_DIR)
frames_dir.mkdir(parents=True, exist_ok=True)
dummy_img = Image.new("RGB", (160, 120), color=(15, 23, 42))
lines = {}
for i in range(1, 16):
    top_ln, bot_ln = (i - 1) * 30 + 1, i * 30
    fid = f"e2e_frame_{i:03d}"
    fn = f"{fid}.png"
    img_path = frames_dir / fn
    dummy_img.save(img_path)
    db.save_frame(pid, fid, fn, top_ln, bot_ln, i, img_path.stat().st_size, "processed", 30)
    for ln in range(top_ln, bot_ln + 1):
        lines[ln] = {"line_number": ln, "text": f"Line {ln}", "confidence": 0.99, "frame_id": fid, "is_verified": 1}
db.save_document_lines(pid, lines)
try:
    req = urllib.request.Request(f"http://127.0.0.1:8000/api/projects/{pid}/activate", method="POST")
    urllib.request.urlopen(req, timeout=5).read()
except Exception:
    pass
print(json.dumps({"project_id": pid, "project_name": p["name"], "frame_count": 15}))
`;
    const out = execSync('python -', { input: pyScript, encoding: 'utf-8' });
    const parsed = JSON.parse(out.trim().split('\n').pop()!);
    createdProjectId = parsed.project_id;
    projectName = parsed.project_name;
    expect(createdProjectId).toBeTruthy();
    expect(parsed.frame_count).toBe(15);
  });

  test('should open slide-out left sidebar, increment MD & ZIP download counters, and delete project', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.goto('/');
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });

    // 1. Open the slide-out left sidebar via the top header toggle button
    const dropdownBtn = page.locator('.project-badge');
    await expect(dropdownBtn).toBeVisible({ timeout: 10000 });
    await expect(dropdownBtn).toContainText(projectName, { timeout: 10000 });
    await dropdownBtn.click();

    const sidebar = page.locator('[data-testid="projects-slideout-sidebar"]');
    await expect(sidebar).toBeVisible();

    const projectCard = sidebar.locator('[data-testid="project-card"]', { hasText: projectName }).first();
    await expect(projectCard).toBeVisible();
    await expect(projectCard).toContainText('15 frames');
    await expect(projectCard).toContainText('450 lines');
    await expect(projectCard).toContainText('450 verified');

    // 2. Verify MD and ZIP download buttons and initial counters (0)
    const mdCountBadge = projectCard.locator('[data-testid="project-md-download-count"]');
    const zipCountBadge = projectCard.locator('[data-testid="project-zip-download-count"]');
    await expect(mdCountBadge).toHaveText('0');
    await expect(zipCountBadge).toHaveText('0');

    // 3. Click MD download button and verify counter increments to 1
    const mdBtn = projectCard.locator('button.btn-download-action.variant-markdown');
    const [mdDownload] = await Promise.all([
      page.waitForEvent('download'),
      mdBtn.click()
    ]);
    expect(mdDownload.suggestedFilename()).toContain('.md');
    await expect(mdCountBadge).toHaveText('1', { timeout: 5000 });

    // 4. Click ZIP download button and verify counter increments to 1
    const zipBtn = projectCard.locator('button.btn-download-action.variant-project');
    const [zipDownload] = await Promise.all([
      page.waitForEvent('download'),
      zipBtn.click()
    ]);
    expect(zipDownload.suggestedFilename()).toContain('.zip');
    await expect(zipCountBadge).toHaveText('1', { timeout: 5000 });

    // Capture screenshot of the slide-out left sidebar & download counters
    await page.screenshot({ path: 'test-results/screenshots/sidebar_download_counters.png' });

    // 5. Click the delete project button on the card
    const deleteBtn = projectCard.locator('button.btn-text-danger');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // 6. Verify confirmation modal is open
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Delete Project');
    await expect(modal).toContainText(projectName);

    // 7. Confirm deletion
    const confirmBtn = modal.locator('.modal-btn-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // 8. Verify the project is removed from the slide-out sidebar and backend
    await expect(sidebar).toBeVisible();
    await expect(sidebar).not.toContainText(projectName, { timeout: 5000 });
    await page.screenshot({ path: 'test-results/screenshots/after_project_deletion.png', fullPage: true });

    await expect.poll(async () => {
      const verifyRes = await page.request.get(`http://127.0.0.1:8000/api/projects`);
      const projectList = await verifyRes.json();
      return projectList.some((p: any) => p.id === createdProjectId);
    }, { timeout: 5000 }).toBeFalsy();
  });

  test('should render collapsed multi-part bundle card with parts/captures/lines metrics, switch parts to load images/markdown/OCR inspector, and export/import bundle', async ({ page }) => {
    const serverDir = path.resolve('..', 'server');
    const bundleSetupScript = `
import sys, json, urllib.request
from pathlib import Path
from PIL import Image
sys.path.insert(0, r"${serverDir}")
import db, config

bundle_id = "bundle_dixui_impact_26_11_05_9_43pm"
bundle_name = "DIXUI_impact_26-11-05-9-43pm"
db.delete_bundle_projects(bundle_id)

frames_dir = Path(config.FRAMES_DIR)
frames_dir.mkdir(parents=True, exist_ok=True)

part_ids = []
for part_idx in range(1, 4):
    part_file = f"{bundle_name}_part{part_idx}.md"
    p = db.create_project(
        name=part_file,
        description=f"File: {part_file}",
        target_total_lines=30,
        bundle_id=bundle_id,
        bundle_name=bundle_name,
        part_number=part_idx,
        total_parts=3,
        part_file_name=part_file
    )
    pid = p["id"]
    part_ids.append(pid)
    for f_i in range(1, 3):
        fid = f"e2e_bundle_p{part_idx}_f{f_i:02d}"
        fn = f"{fid}.png"
        img_path = frames_dir / fn
        Image.new("RGB", (640, 360), color=(25 * part_idx, 40 * f_i, 90)).save(img_path)
        top_ln = (f_i - 1) * 15 + 1
        bot_ln = f_i * 15
        db.save_frame(pid, fid, fn, top_ln, bot_ln, f_i, img_path.stat().st_size, "processed", 15)
    lines = {}
    for ln in range(1, 31):
        fid_ref = f"e2e_bundle_p{part_idx}_f01" if ln <= 15 else f"e2e_bundle_p{part_idx}_f02"
        lines[ln] = {
            "line_number": ln,
            "text": f"DIXUI Part {part_idx} Markdown Line {ln}",
            "confidence": 0.99,
            "frame_id": fid_ref,
            "is_verified": 1 if ln <= 25 else 0
        }
    db.save_document_lines(pid, lines)
    db.save_project_telemetry(
        pid,
        {"current_page": 2, "current_top_line": 16, "current_bottom_line": 30},
        {"total_tokens": 500 * part_idx, "total_api_calls": part_idx}
    )
    db.sync_project_part_markdown_file(pid)

try:
    req = urllib.request.Request(f"http://127.0.0.1:8000/api/projects/{part_ids[0]}/activate", method="POST")
    urllib.request.urlopen(req, timeout=5).read()
except Exception:
    pass
print(json.dumps({"bundle_id": bundle_id, "part_ids": part_ids}))
`;
    execSync('python -', { input: bundleSetupScript, encoding: 'utf-8' });

    await page.goto('/');
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });

    // 1. Open Slide-Out Left Sidebar
    const toggleBtn = page.locator('[data-testid="toggle-projects-sidebar-btn"]');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    const sidebar = page.locator('[data-testid="projects-slideout-sidebar"]');
    await expect(sidebar).toBeVisible();

    // 2. Verify Bundle Card is rendered and collapsed by default with aggregated metrics
    // 3 parts * 2 captures = 6 captures, 3 parts * 30 total lines = 90 total lines, 3 parts * 25 verified = 75 verified lines
    const bundleCard = sidebar.locator('[data-testid="project-bundle-card"][data-bundle-id="bundle_dixui_impact_26_11_05_9_43pm"]');
    await expect(bundleCard).toBeVisible();
    await expect(bundleCard.locator('[data-testid="bundle-parts-drawer"]')).toHaveCount(0);
    await expect(bundleCard.locator('[data-testid="bundle-parts-count"]')).toContainText('3 Parts / MDs');
    await expect(bundleCard.locator('[data-testid="bundle-metric-parts"]')).toContainText('3');
    await expect(bundleCard.locator('[data-testid="bundle-metric-captures"]')).toContainText('6');
    await expect(bundleCard.locator('[data-testid="bundle-metric-total-lines"]')).toContainText('90');
    await expect(bundleCard.locator('[data-testid="bundle-metric-verified-lines"]')).toContainText('75');

    await page.screenshot({ path: 'test-results/screenshots/bundle_card_collapsed.png' });

    // 3. Expand the bundle card to reveal individual markdown parts
    await bundleCard.locator('[data-testid="bundle-card-header"]').click();
    const partsDrawer = bundleCard.locator('[data-testid="bundle-parts-drawer"]');
    await expect(partsDrawer).toBeVisible();
    const partCards = partsDrawer.locator('[data-testid="bundle-part-card"]');
    await expect(partCards).toHaveCount(3);
    await expect(partCards.nth(1)).toContainText('DIXUI_impact_26-11-05-9-43pm_part2.md');
    await expect(partCards.nth(1)).toContainText('2 captures');
    await expect(partCards.nth(1)).toContainText('30 total lines');
    await expect(partCards.nth(1)).toContainText('25 verified');

    await page.screenshot({ path: 'test-results/screenshots/bundle_card_expanded.png' });

    // 4. Click Part 2 and verify its scanned images, markdown lines, and OCR Line Inspector data load
    await partCards.nth(1).click();
    await expect(toggleBtn).toContainText('DIXUI_impact_26-11-05-9-43pm_part2.md', { timeout: 5000 });
    await expect(page.getByText('DIXUI Part 2 Markdown Line 1', { exact: false }).first()).toBeVisible({ timeout: 5000 });

    // Switch to OCR Line Inspector workspace and verify Part 2's frame & OCR inspector data loaded
    const ocrTab = page.getByRole('tab', { name: /2\. OCR Line Inspector/i });
    await ocrTab.click();
    await expect(page.getByText('DIXUI Part 2 Markdown Line 1', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/screenshots/bundle_part2_ocr_inspector.png' });

    // 5. Export the full bundle ZIP and re-import it
    const bundleZipBtn = bundleCard.locator('[data-testid="bundle-zip-export-btn"]');
    const [bundleZipDownload] = await Promise.all([
      page.waitForEvent('download'),
      bundleZipBtn.click()
    ]);
    const zipPath = path.resolve('test-results', 'dixui_bundle_export.zip');
    await bundleZipDownload.saveAs(zipPath);
    await expect(bundleCard.locator('[data-testid="bundle-zip-download-count"]')).toHaveText('1', { timeout: 5000 });

    // Delete the bundle via API, then import the ZIP via the UI file input and verify restoration
    await page.request.delete('http://127.0.0.1:8000/api/projects/bundle/bundle_dixui_impact_26_11_05_9_43pm');
    await expect(bundleCard).toHaveCount(0, { timeout: 5000 });

    const fileInput = page.locator('input[type="file"][accept=".zip"]');
    await fileInput.setInputFiles(zipPath);

    await expect(bundleCard).toBeVisible({ timeout: 10000 });
    await expect(bundleCard.locator('[data-testid="bundle-metric-parts"]')).toContainText('3');
    await expect(bundleCard.locator('[data-testid="bundle-metric-captures"]')).toContainText('6');
    await expect(bundleCard.locator('[data-testid="bundle-metric-total-lines"]')).toContainText('90');
    await expect(bundleCard.locator('[data-testid="bundle-metric-verified-lines"]')).toContainText('75');

    // Clean up test bundle
    await page.request.delete('http://127.0.0.1:8000/api/projects/bundle/bundle_dixui_impact_26_11_05_9_43pm');
  });
});
