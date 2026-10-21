// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import { expect, type ElectronApplication, type Page } from '@playwright/test';

// Opens a quick input (command palette, quick open, go to line), and accepts the row containing `pick`
export async function quickInput(
  page: Page,
  shortcut: string,
  text: string,
  pick: string | RegExp,
) {
  const input = page.locator('.quick-input-widget input');
  await page.keyboard.press(shortcut);
  await expect(input).toBeFocused();
  // The input can still get cleared right after opening, so retry until the right row shows up
  await expect(async () => {
    await input.fill(text);
    const row = page.locator('.quick-input-list .monaco-list-row.focused');
    await (typeof pick === 'string'
      ? expect(row).toContainText(pick, { timeout: 2_000 })
      : expect(row).toHaveAttribute('aria-label', pick, { timeout: 2_000 }));
  }).toPass();
  await page.keyboard.press('Enter');
}

export function runCommand(page: Page, command: string) {
  const label = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return quickInput(page, 'F1', `>${command}`, new RegExp(`^${label}(,|$)`));
}

export async function openTerminal(page: Page, name: string) {
  await page.getByRole('tab', { name: /^Terminal/ }).click();
  await page
    .getByLabel('Terminal tabs')
    .getByText(name, { exact: true })
    .click();
  return page.locator('.terminal-wrapper.active');
}

// Only the visible rows are in the DOM, so go through the clipboard to get the whole buffer
export async function terminalText(
  app: ElectronApplication,
  page: Page,
  name: string,
) {
  await (await openTerminal(page, name)).click();
  await app.evaluate(({ clipboard }) => clipboard.clear());
  await runCommand(page, 'Terminal: Select All');
  await page.keyboard.press('Control+Shift+C');
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

export async function typeInto(page: Page, terminal: string, text: string) {
  await (await openTerminal(page, terminal)).click();
  await page.keyboard.type(text);
}

export async function startDebugging(page: Page) {
  await page.keyboard.press('F5');
  await expect(page.getByRole('button', { name: /^Step Over/ })).toBeVisible();
}
