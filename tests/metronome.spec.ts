import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SHOTS = process.env.PT_SHOTS_DIR || 'test-results/practice-tool';

type EngineEvent = { time: number; bar: number; beat: number; sub: number; silent: boolean; bpm: number };

async function readEvents(page: Page): Promise<EngineEvent[]> {
  return page.evaluate(() => {
    const w = window as Window & { __practiceToolEvents?: () => EngineEvent[] };
    return w.__practiceToolEvents ? w.__practiceToolEvents() : [];
  });
}

test.describe('practice tool', () => {
  test('schedules clicks sample-accurately on the audio clock', async ({ page }) => {
    await page.goto('/tools/metronome?bpm=120&sub=1&swing=0');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForTimeout(2600);
    await page.keyboard.press('Escape');

    const events = await readEvents(page);
    expect(events.length).toBeGreaterThan(4);
    const beatEvents = events.filter((e) => e.bar >= 0);
    for (let i = 1; i < beatEvents.length; i += 1) {
      const dt = beatEvents[i].time - beatEvents[i - 1].time;
      // 120 BPM = 0.5 s per beat; sample accuracy means exact float sums, no timer jitter.
      expect(Math.abs(dt - 0.5)).toBeLessThan(1e-6);
    }
    expect(beatEvents.slice(0, 5).map((e) => e.beat)).toEqual([0, 1, 2, 3, 0]);
  });

  test('deep link sets meter, drone and ladder; keys adjust tempo', async ({ page }) => {
    await page.goto('/tools/metronome?bpm=96&beats=3+2+2&drone=D3&ramp=60-120x4@4&goal=Dukas%20fig.%2017');
    await expect(page.locator('.pt-goal')).toHaveText('Dukas fig. 17');
    await expect(page.locator('.pt-dot')).toHaveCount(7);
    await expect(page.locator('.pt-ladder-mini')).toContainText('60 → 120');
    await expect(page.getByRole('button', { name: /Drone D3 on/ })).toBeVisible();
    // The bpm param wins over the ramp start when both are given.
    await expect(page.locator('.pt-bpm')).toHaveText('96');

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.pt-bpm')).toHaveText('97');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator('.pt-bpm')).toHaveText('92');
  });

  test('rate-it ladder asks after a block and raises the tempo on a clean answer', async ({ page }) => {
    await page.goto('/tools/metronome?bpm=240&beats=2&ramp=240-260x4@1&mode=rate');
    await page.getByRole('button', { name: /Start at 240/ }).click();
    await expect(page.locator('.pt-prompt')).toContainText('clean', { timeout: 5000 });
    await page.keyboard.press('PageDown');
    await expect(page.locator('.pt-bpm')).toHaveText('244', { timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('gap click marks silent bars', async ({ page }) => {
    await page.goto('/tools/metronome?bpm=240&beats=2&gap=1/1');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape');
    const events = await readEvents(page);
    const silentBars = new Set(events.filter((e) => e.silent).map((e) => e.bar));
    const loudBars = new Set(events.filter((e) => !e.silent).map((e) => e.bar));
    expect([...silentBars].every((b) => b % 2 === 1)).toBe(true);
    expect([...loudBars].every((b) => b % 2 === 0)).toBe(true);
    expect(silentBars.size).toBeGreaterThan(0);
  });

  test('has no WCAG A/AA violations and renders on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tools/metronome?drone=A3&ramp=60-120x4@4&pattern=tresillo');
    await page.screenshot({ path: `${SHOTS}/phone-top.png` });
    await page.screenshot({ path: `${SHOTS}/phone-full.png`, fullPage: true });

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);

    await page.getByRole('button', { name: 'Stand mode' }).click();
    await expect(page.getByRole('dialog', { name: 'Stand mode' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/phone-stand.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Stand mode' })).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: `${SHOTS}/desktop.png`, fullPage: true });
  });
});
