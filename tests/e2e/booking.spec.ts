import { expect, test, type Page } from '@playwright/test';

const FIXED_TIME = new Date('2030-10-02T06:00:00Z'); // Moscow 09:00, browser timezone is deliberately Los Angeles.
async function open(page: Page) { await page.clock.setFixedTime(FIXED_TIME); await page.goto('/'); await expect(page.getByRole('radio', { name: '10:00', exact: true })).toBeVisible(); }
async function prepare(page: Page, slot = '10:00') {
  await page.getByRole('radio', { name: slot, exact: true }).check();
  await page.getByRole('textbox', { name: 'Демо-имя' }).fill('Гость демо');
  await page.getByRole('textbox', { name: 'Что происходит с велосипедом' }).fill('Учебный городской велосипед');
  await page.getByRole('checkbox', { name: /Использую вымышленные/ }).check();
}
test('booking → reload → reschedule → cancellation releases the interval', async ({ page }) => {
  await open(page); await page.screenshot({ path: 'test-results/desktop-booking.png', fullPage: true }); await prepare(page);
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible();
  await expect(page.getByText('10:00–10:30 · МСК', { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: /^Мои записи/ }).click();
  await expect(page.getByRole('heading', { name: 'Диагностика велосипеда', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Перенести', exact: true }).click();
  await page.getByRole('radio', { name: '12:00', exact: true }).check();
  await page.getByRole('button', { name: 'Подтвердить перенос', exact: true }).click();
  await expect(page.getByText('12:00–12:30 · МСК', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить запись', exact: true }).click();
  await page.getByRole('button', { name: 'Вернуться', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Перенести', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить запись', exact: true }).click();
  await page.getByRole('button', { name: 'Да, отменить запись', exact: true }).click();
  await expect(page.getByText('Отменена', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Записаться', exact: true }).click();
  await expect(page.getByRole('radio', { name: '10:00', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: '12:00', exact: true })).toBeVisible();
});
test('two tabs racing for one slot get exactly one confirmation', async ({ page, context }) => {
  await open(page); const second = await context.newPage(); await open(second);
  await prepare(page); await prepare(second);
  await Promise.allSettled([page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click({ timeout: 3000 }), second.getByRole('button', { name: 'Подтвердить запись', exact: true }).click({ timeout: 3000 })]);
  await expect.poll(async () => (await page.getByRole('heading', { name: 'Запись подтверждена' }).count()) + (await second.getByRole('heading', { name: 'Запись подтверждена' }).count())).toBe(1);
  await expect.poll(async () => (await page.getByRole('alert').count()) + (await second.getByRole('alert').count())).toBe(1);
  const state = await page.evaluate(async () => {
    const request = indexedDB.open('spitsa-workshop-demo-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const value = await new Promise<{ mineIds: string[] }>(resolve => { const r = db.transaction('state').objectStore('state').get('workshop'); r.onsuccess = () => resolve(r.result); }); db.close(); return value;
  });
  expect(state.mineIds).toHaveLength(1);
});
test('owner sees appointments, cannot close an occupied day, edits an empty day and resets', async ({ page }) => {
  await open(page); await prepare(page); await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await page.getByRole('button', { name: /Владельцу/ }).click();
  await expect(page.getByText('Это не настоящая авторизация.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Войти в демо-кабинет', exact: true }).click();
  await expect(page.getByText('Гость демо', { exact: false }).first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Выходной день' }).check();
  await page.getByRole('button', { name: 'Сохранить расписание' }).click();
  await expect(page.getByRole('alert')).toContainText('подтверждённую запись');
  await page.getByLabel('Дата расписания').fill('2030-10-09');
  await page.getByRole('checkbox', { name: 'Выходной день' }).check();
  await page.getByRole('button', { name: 'Сохранить расписание' }).click();
  await expect(page.getByRole('status')).toContainText('Расписание сохранено');
  await page.getByRole('button', { name: 'Записаться', exact: true }).click();
  await page.getByLabel('Выберите дату').fill('2030-10-09');
  await expect(page.getByRole('heading', { name: 'В этот день мастерская закрыта' })).toBeVisible();
  await page.getByRole('button', { name: /Владельцу/ }).click();
  await page.getByRole('button', { name: 'Сбросить демо-данные', exact: true }).click();
  await page.getByRole('button', { name: 'Сбросить данные', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Демо сброшено');
  await page.getByRole('button', { name: /^Мои записи/ }).click();
  await expect(page.getByRole('heading', { name: 'Вы ещё не записались' })).toBeVisible();
});
test('owner can reschedule a synthetic seed and returns to the right day', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: /Владельцу/ }).click(); await page.getByRole('button', { name: 'Войти в демо-кабинет' }).click();
  await page.getByLabel('Дата расписания').fill('2030-10-03');
  await expect(page.getByRole('heading', { name: 'Настройка тормозов', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Перенести', exact: true }).click();
  await page.getByLabel('Выберите дату').fill('2030-10-09');
  await page.getByRole('radio', { name: '12:00', exact: true }).check();
  await page.getByRole('button', { name: 'Подтвердить перенос' }).click();
  await expect(page.getByLabel('Дата расписания')).toHaveValue('2030-10-09');
  await expect(page.getByText('12:00–13:00 · МСК', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить запись', exact: true }).click();
  await page.getByRole('button', { name: 'Да, отменить запись', exact: true }).click();
  await expect(page.getByText('Отменена', { exact: true })).toBeVisible();
});
test('mobile layout, empty state, validation and literal markup remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  const browserErrors: string[] = []; page.on('pageerror', error => browserErrors.push(error.message));
  await page.getByLabel('Выберите дату').fill('2030-10-07');
  await expect(page.getByRole('heading', { name: 'В этот день мастерская закрыта' })).toBeVisible();
  await page.getByLabel('Выберите дату').fill('2030-10-02');
  await prepare(page);
  await page.getByRole('textbox', { name: 'Демо-имя' }).fill(' ');
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Демо-имя' }).fill('<script>demo</script>');
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  expect(browserErrors).toEqual([]);
  await page.screenshot({ path: 'test-results/mobile-confirmation.png', fullPage: true });
  await page.getByRole('button', { name: /Владельцу/ }).click();
  await page.getByRole('button', { name: 'Войти в демо-кабинет' }).click();
  await expect(page.getByText('<script>demo</script>', { exact: false }).first()).toBeVisible();
  await expect(page.locator('article script')).toHaveCount(0);
});
test('optional WebMCP registry calls the same transactions and handles bad input', async ({ page }) => {
  await page.addInitScript(() => {
    const registry = new Map<string, { execute: (input: unknown) => Promise<unknown>; inputSchema: object; annotations: object }>();
    Object.defineProperty(document, 'modelContext', { value: { registerTool(tool: { name: string; execute: (input: unknown) => Promise<unknown>; inputSchema: object; annotations: object }, options: { signal: AbortSignal }) { registry.set(tool.name, tool); options.signal.addEventListener('abort', () => registry.delete(tool.name)); } } });
    (window as unknown as { demoTools: typeof registry }).demoTools = registry;
  });
  await open(page);
  const result = await page.evaluate(async () => {
    const registry = (window as unknown as { demoTools: Map<string, { execute: (input: unknown) => Promise<unknown>; inputSchema: object; annotations: object }> }).demoTools;
    const reader = registry.get('spitsa_available_slots')!;
    const writer = registry.get('spitsa_create_demo_booking')!;
    let rejected = false; try { await writer.execute({ name: 'Гость демо' }); } catch { rejected = true; }
    const slots = await reader.execute({ serviceId: 'diagnostics', date: '2030-10-02' }) as { starts: number[] };
    const booking = await writer.execute({ serviceId: 'diagnostics', start: slots.starts[0], name: 'Гость демо', acknowledgedDemo: true });
    return { rejected, booking, annotations: reader.annotations, names: [...registry.keys()] };
  });
  expect(result.rejected).toBe(true);
  expect(result.annotations).toMatchObject({ readOnlyHint: true });
  expect(result.names).toEqual(['spitsa_available_slots', 'spitsa_create_demo_booking']);
  expect(result.booking).toMatchObject({ status: 'confirmed' });
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible();
});
