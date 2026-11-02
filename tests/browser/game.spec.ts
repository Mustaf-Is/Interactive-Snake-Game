import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

for (const failSave of [false, true]) {
  test(failSave ? 'failed save locks a new game until retry succeeds' : 'controls, pause, completion and persistence', async ({page}, testInfo) => {
    let attempts = 0;
    let replay: {id: string; ticks: number; turns: {tick: number; direction: string}[]} | undefined;
    await page.route('**/api/games', async route => {
      if (route.request().method() === 'PUT') {
        replay = route.request().postDataJSON();
        if (failSave && attempts++ === 0) {
          await route.fulfill({status: 503, json: {error: 'Injected temporary failure'}});
          return;
        }
      }
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('heading', {name: 'Global records'})).toBeVisible();
    await page.getByRole('button', {name: 'START GAME', exact: true}).click();
    await expect(page.getByRole('radio', {name: /Easy/})).toBeDisabled();
    // Remove button focus so Space reaches the global keyboard handler.
    await page.locator('canvas').click();
    await page.keyboard.press('w');
    await page.waitForTimeout(250);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', {name: 'PAUSED', exact: true})).toBeVisible();
    const paused = await page.locator('canvas').evaluate(c => (c as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(400);
    expect(await page.locator('canvas').evaluate(c => (c as HTMLCanvasElement).toDataURL())).toBe(paused);
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', {name: 'PAUSED', exact: true})).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByRole('heading', {name: 'PAUSED', exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'RESUME', exact: true}).click();
    if (testInfo.project.name === 'phone') {
      await expect(page.getByRole('button', {name: 'Move up', exact: true})).toBeVisible();
      await page.getByRole('button', {name: 'Move up', exact: true}).dispatchEvent('pointerdown');
    }
    await expect(page.getByRole('heading', {name: 'GAME OVER', exact: true})).toBeVisible({timeout: 10_000});
    if (failSave) {
      await expect(page.getByRole('button', {name: 'PLAY AGAIN', exact: true})).toBeDisabled();
      await expect(page.getByRole('radio', {name: /Easy/})).toBeDisabled();
      await page.getByRole('button', {name: 'Retry saving'}).click();
    }
    await expect(page.getByText('Game saved', {exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'PLAY AGAIN', exact: true})).toBeEnabled();
    expect(replay?.turns.map(t => t.direction)).toEqual(expect.arrayContaining(['up', 'right']));
    const saved = await page.request.put('/api/games', {data: replay});
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({saved: true});
    await page.reload();
    await page.getByRole('button', {name: 'History', exact: true}).click();
    const stats = await (await page.request.get('/api/games')).json();
    expect(stats.recent).toEqual(expect.arrayContaining([expect.objectContaining({id: replay?.id, status: 'completed'})]));
    await expect(page.locator('.record-row').first()).not.toContainText('Unfinished');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('API smoke succeeds with five higher scores already stored', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const {stdout} = await promisify(execFile)(process.execPath, ['--experimental-strip-types', 'tests/api-smoke.mjs'], {
    env: {...process.env, SNAKE_TEST_URL: 'http://127.0.0.1:4173'},
  });
  expect(stdout).toContain('"result":"PASS"');
});

test('optional account keeps named records across sign-out and sign-in', async ({page}, testInfo) => {
  const username = `P_${testInfo.project.name}`;
  const password = 'one more game in 1997';
  await page.goto('/');
  await page.getByRole('button', {name: 'New player', exact: true}).click();
  await page.getByLabel('Player name', {exact: true}).fill(username);
  await page.getByLabel('Password', {exact: true}).fill(password);
  await page.getByRole('button', {name: 'Create player', exact: true}).click();
  await expect(page.locator('.player-display strong')).toHaveText(username);
  await page.getByRole('button', {name: 'START GAME', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Sign out', exact: true})).toBeDisabled();
  await expect(page.getByText('Game saved', {exact: true})).toBeVisible({timeout: 10_000});
  await page.getByRole('button', {name: 'My records', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'My records', exact: true})).toBeVisible();
  await expect(page.locator('.record-row strong')).toHaveText(username);
  await expect(page.locator('.score-strip > div').nth(1).locator('strong')).toHaveText('9990');
  await page.getByRole('button', {name: 'Sign out', exact: true}).click();
  await expect(page.locator('.player-display strong')).toHaveText('GUEST MODE');
  await expect(page.getByRole('button', {name: 'My records', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: 'Returning player', exact: true}).click();
  await page.getByLabel('Player name', {exact: true}).fill(username.toUpperCase());
  await page.getByLabel('Password', {exact: true}).fill(password);
  await page.getByRole('button', {name: 'Sign in', exact: true}).click();
  await expect(page.locator('.player-display strong')).toHaveText(username);
  await page.reload();
  await expect(page.locator('.player-display strong')).toHaveText(username);
  await page.getByRole('button', {name: 'My records', exact: true}).click();
  await expect(page.locator('.record-row strong')).toHaveText(username);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path: testInfo.outputPath('player-records.png'), fullPage: true});
});
