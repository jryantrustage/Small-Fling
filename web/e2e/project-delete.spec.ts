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

  test('should load project dropdown, increment MD & ZIP download counters, and delete project', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.goto('/');
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });

    // 1. Open the project dropdown in the top header
    const dropdownBtn = page.locator('.project-badge');
    await expect(dropdownBtn).toBeVisible({ timeout: 10000 });
    await expect(dropdownBtn).toContainText(projectName, { timeout: 10000 });
    await dropdownBtn.click();

    const popover = page.locator('.project-dropdown-popover');
    await expect(popover).toBeVisible();
    await expect(popover).toContainText(projectName);
    await expect(popover).toContainText('15 frames');

    // 2. Verify MD and ZIP download buttons and initial counters (0)
    const mdCountBadge = popover.locator('[data-testid="project-md-download-count"]').first();
    const zipCountBadge = popover.locator('[data-testid="project-zip-download-count"]').first();
    await expect(mdCountBadge).toHaveText('0');
    await expect(zipCountBadge).toHaveText('0');

    // 3. Click MD download button and verify counter increments to 1
    const mdBtn = popover.locator('button.btn-download-action.variant-markdown').nth(1);
    const [mdDownload] = await Promise.all([
      page.waitForEvent('download'),
      mdBtn.click()
    ]);
    expect(mdDownload.suggestedFilename()).toContain('.md');
    await expect(mdCountBadge).toHaveText('1', { timeout: 5000 });

    // 4. Click ZIP download button and verify counter increments to 1
    const zipBtn = popover.locator('button.btn-download-action.variant-project').nth(1);
    const [zipDownload] = await Promise.all([
      page.waitForEvent('download'),
      zipBtn.click()
    ]);
    expect(zipDownload.suggestedFilename()).toContain('.zip');
    await expect(zipCountBadge).toHaveText('1', { timeout: 5000 });

    // Capture screenshot of the styled download buttons & counters
    await page.screenshot({ path: 'test-results/screenshots/dropdown_download_counters.png' });

    // 5. Click the delete project button on the row
    const deleteBtn = popover.locator('button.btn-text-danger').first();
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

    // 8. Verify the project is removed from the header, dropdown, and backend
    await expect(dropdownBtn).toContainText('Select Project', { timeout: 5000 });
    if (!(await popover.isVisible())) {
      await dropdownBtn.click();
    }
    await expect(popover).toBeVisible();
    await expect(popover).not.toContainText(projectName, { timeout: 5000 });
    await page.screenshot({ path: 'test-results/screenshots/after_project_deletion.png', fullPage: true });

    const verifyRes = await page.request.get(`http://127.0.0.1:8000/api/projects`);
    const projectList = await verifyRes.json();
    const stillExists = projectList.some((p: any) => p.id === createdProjectId);
    expect(stillExists).toBeFalsy();
  });
});
