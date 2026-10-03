import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';

test.describe('Project Lifecycle & Deletion Suite with 15 Captures', () => {
  let createdProjectId: string = '';
  let projectName: string = 'Matrix_15_Captures_Delete_Test';

  test.beforeAll(async () => {
    // Run setup script that initializes 15 captures, image files, and document lines
    const scriptPath = path.resolve('..', 'scripts', 'setup_test_project_15_captures.py');
    const out = execSync(`python "${scriptPath}"`, { encoding: 'utf-8' });
    const parsed = JSON.parse(out.trim());
    createdProjectId = parsed.project_id;
    projectName = parsed.project_name;
    expect(createdProjectId).toBeTruthy();
    expect(parsed.frame_count).toBe(15);
  });

  test('should load studio with 15 captures, open sidebar without squishing, and delete project', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.goto('/');
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });

    // 1. Verify project name in header badge
    const badge = page.locator('.project-badge-name');
    await expect(badge).toHaveText(projectName, { timeout: 10000 });

    // 2. Verify 15 captures are displayed in the frames panel
    const framesHeader = page.locator('.frames-feed-panel .panel-header');
    await expect(framesHeader).toContainText('Captured Frames (15)', { timeout: 10000 });

    // Ensure 15 frame cards exist in the feed
    const frameCards = page.locator('.frame-card');
    await expect(frameCards).toHaveCount(15, { timeout: 10000 });

    // Capture screenshot of UI with 15 captures
    await page.screenshot({ path: 'test-results/screenshots/15_captures_active_project.png', fullPage: true });

    // 3. Open the projects sidebar
    const sidebar = page.locator('.projects-sidebar');
    const isCollapsed = await sidebar.evaluate(el => el.classList.contains('collapsed'));
    if (isCollapsed) {
      const rail = page.locator('.projects-sidebar-rail, .project-badge');
      await rail.first().click();
      await page.waitForTimeout(400);
    }

    // 4. Verify sidebar is expanded and not crushed (width >= 250px)
    const sidebarWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width);
    expect(sidebarWidth).toBeGreaterThanOrEqual(250);

    // Verify active project card details in sidebar
    const activeCard = page.locator('.project-card.active');
    await expect(activeCard).toBeVisible();
    await expect(activeCard).toContainText(projectName);
    await expect(activeCard).toContainText('15 frames');

    // Capture screenshot of sidebar with 15 frames stats
    await page.screenshot({ path: 'test-results/screenshots/sidebar_expanded_with_stats.png' });

    // 5. Click the delete project button on the card
    const deleteBtn = activeCard.locator('button.btn-text-danger');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await page.waitForTimeout(400);

    // 6. Verify confirmation modal is open
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Delete Project');
    await expect(modal).toContainText(projectName);

    // Capture screenshot of confirmation modal
    await page.screenshot({ path: 'test-results/screenshots/delete_project_modal.png' });

    // 7. Confirm deletion
    const confirmBtn = modal.locator('.modal-btn-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    await page.waitForTimeout(1000);

    // 8. Verify the project card is no longer in the projects list
    const deletedCard = page.locator(`.project-card:has-text("${projectName}")`);
    await expect(deletedCard).toHaveCount(0);

    // 9. Verify UI transitioned cleanly (no hanging frames from deleted project)
    await page.screenshot({ path: 'test-results/screenshots/after_project_deletion.png', fullPage: true });

    // 10. Check backend API to ensure project was deleted
    const verifyRes = await page.request.get(`http://localhost:8000/api/projects`);
    const projectList = await verifyRes.json();
    const stillExists = projectList.some((p: any) => p.id === createdProjectId);
    expect(stillExists).toBeFalsy();
  });
});
