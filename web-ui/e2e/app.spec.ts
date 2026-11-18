import { test, expect } from '@playwright/test';
import type { Cookie } from '@playwright/test';

let cookies: Cookie[];
test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { password: 'browser-test-password' } });
  expect(login.status()).toBe(200);
  cookies = (await request.storageState()).cookies;
});

test.beforeEach(async ({ page }) => {
  // Keep tests offline: previews are external content, not part of these checks.
  await page.route(/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\//, route => route.abort());
});

test('login rejects a control-character open redirect and stays on this app', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/login?next=' + encodeURIComponent('/\t/evil.example'));
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:43128/');
  await expect(page.getByRole('heading', { name: 'YouTube Video Summarizer' })).toBeVisible();
});

test('summary options, results, copy and reset work in a real browser', async ({ page, context }) => {
  await context.addCookies(cookies);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('YouTube URL or Video ID').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByText('Advanced Options', { exact: true }).click();
  await page.getByLabel('Summary Type', { exact: true }).selectOption('detailed');
  await page.getByLabel('Include full transcript').check();
  const sent = page.waitForRequest(request => request.url().endsWith('/api/summarize'));
  await page.getByRole('button', { name: 'Summarize Video' }).click();
  expect((await sent).postDataJSON()).toEqual({ video: 'https://youtu.be/dQw4w9WgXcQ', summaryType: 'detailed', showTranscript: true });
  await expect(page.getByRole('heading', { name: 'Summary', exact: true })).toBeVisible();
  await expect(page.getByText('Original transcript.', { exact: true })).toBeVisible();
  await expect(page.getByText(/A summary with/)).toContainText('inside.');
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('inside.');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByLabel('YouTube URL or Video ID')).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Summary', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).find(cookie => cookie.name === 'ytsum_auth')).toBeUndefined();
});

test('cancelling a pending summary restores the form and allows retry', async ({ page, context }) => {
  await context.addCookies(cookies);
  await page.goto('/');
  await page.getByLabel('YouTube URL or Video ID').fill('SLOW0000001');
  await page.getByRole('button', { name: 'Summarize Video' }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Processing cancelled.', { exact: true })).toBeVisible();
  await page.getByLabel('YouTube URL or Video ID').fill('dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Summarize Video' }).click();
  await expect(page.getByRole('heading', { name: 'Summary', exact: true })).toBeVisible();
});

test('expired sessions provide a working sign-in path without losing form input', async ({ page, context }) => {
  await context.addCookies(cookies);
  await page.goto('/');
  await context.clearCookies();
  await page.getByLabel('YouTube URL or Video ID').fill('dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Summarize Video' }).click();
  await expect(page.getByText('Your session has expired. Sign in again to continue.')).toBeVisible();
  await expect(page.getByLabel('YouTube URL or Video ID')).toHaveValue('dQw4w9WgXcQ');
  await page.getByRole('link', { name: 'Sign in again' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
});

test('network failure preserves input and lets the user retry', async ({ page, context }) => {
  await context.addCookies(cookies);
  await page.goto('/');
  await page.route('**/api/summarize', route => route.abort('failed'));
  await page.getByLabel('YouTube URL or Video ID').fill('dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Summarize Video' }).click();
  await expect(page.getByText('Could not complete the request. Check your connection and try again.')).toBeVisible();
  await expect(page.getByLabel('YouTube URL or Video ID')).toHaveValue('dQw4w9WgXcQ');
  await page.unroute('**/api/summarize');
  await page.getByRole('button', { name: 'Summarize Video' }).click();
  await expect(page.getByRole('heading', { name: 'Summary', exact: true })).toBeVisible();
});
