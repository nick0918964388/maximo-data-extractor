// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE_URL = 'http://192.168.1.214:8000';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

test.describe('original_host field — ConnectionPage', () => {

  test('should display and persist the 原始主機位址 field', async ({ page }) => {
    // Step 1: Navigate to app
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_initial_load.png'), fullPage: true });
    console.log('[Step 1] Navigated to', BASE_URL);

    // Step 2: Confirm we are on the 連線設定 tab (or click it)
    const connTab = page.locator('text=連線設定');
    if (await connTab.count() > 0) {
      await connTab.first().click();
      await page.waitForLoadState('networkidle');
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_connection_tab.png'), fullPage: true });
    console.log('[Step 2] On 連線設定 tab');

    // Step 3: If there are existing connections, click 編輯 on the first one
    //         Otherwise create a new connection
    const editBtn = page.locator('button:has-text("編輯")').first();
    const newBtn  = page.locator('button:has-text("新增連線"), button:has-text("新增第一個連線")').first();

    let isEditing = false;
    if (await editBtn.count() > 0) {
      await editBtn.click();
      isEditing = true;
      console.log('[Step 3] Clicked 編輯 on existing connection');
    } else {
      await newBtn.click();
      console.log('[Step 3] Clicked 新增連線 (no existing connections)');
    }
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_form_opened.png'), fullPage: true });

    // Step 4: Verify the 原始主機位址 field is present
    const originalHostInput = page.locator('input[name="original_host"], input[placeholder*="192.168.36"]');
    await expect(originalHostInput).toBeVisible({ timeout: 5000 });
    console.log('[Step 4] 原始主機位址 field is visible');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_original_host_field_visible.png'), fullPage: true });

    // Also check the label text
    const label = page.locator('label:has-text("原始主機位址")');
    await expect(label).toBeVisible();
    console.log('[Step 4] Label "原始主機位址" is visible');

    // Step 5: If creating new, fill required fields first
    if (!isEditing) {
      await page.fill('input[name="name"]', 'Test Connection');
      await page.fill('input[name="base_url"]', 'https://maximo.test.com/maximo');
      await page.fill('input[name="api_key"]', 'test-api-key-12345');
    }

    // Step 6: Fill in the original_host field
    await originalHostInput.clear();
    await originalHostInput.fill('192.168.36.61');
    console.log('[Step 6] Filled original_host with 192.168.36.61');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_original_host_filled.png'), fullPage: true });

    // Step 7: Save
    const saveBtn = page.locator('button:has-text("儲存設定")');
    await saveBtn.click();
    console.log('[Step 7] Clicked 儲存設定');

    // Wait for the form to close (save success) or success message
    await page.waitForLoadState('networkidle');
    // After save the form closes, or a success message appears
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_after_save.png'), fullPage: true });
    console.log('[Step 7] Screenshot after save');

    // Step 8: Click 編輯 again to verify the value persisted
    const editBtnAfterSave = page.locator('button:has-text("編輯")').first();
    await expect(editBtnAfterSave).toBeVisible({ timeout: 5000 });
    await editBtnAfterSave.click();
    await page.waitForLoadState('networkidle');
    console.log('[Step 8] Re-opened edit form');

    // Step 9: Check that original_host value is persisted
    const persistedInput = page.locator('input[name="original_host"]');
    await expect(persistedInput).toBeVisible();
    const persistedValue = await persistedInput.inputValue();
    console.log('[Step 9] Persisted original_host value:', persistedValue);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_persisted_value.png'), fullPage: true });

    expect(persistedValue).toBe('192.168.36.61');
    console.log('[Step 9] Value correctly persisted as 192.168.36.61');

    // Step 10: Also verify it shows in the connection list (after closing form)
    const cancelBtn = page.locator('button:has-text("取消")');
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await page.waitForLoadState('networkidle');
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_connection_list_with_original_host.png'), fullPage: true });
    // Verify the original_host appears in the list row
    const originalHostInList = page.locator('text=192.168.36.61');
    if (await originalHostInList.count() > 0) {
      console.log('[Step 10] original_host visible in connection list');
    }
  });
});
