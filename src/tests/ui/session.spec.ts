// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import { runCommand, startDebugging, terminalText, typeInto } from './utils';

test('terminals are named after their endpoints', async ({
  workbench: page,
}) => {
  await startDebugging(page);
  await page.getByRole('tab', { name: /^Terminal/ }).click();
  const tabs = page.getByLabel('Terminal tabs');
  for (const name of [
    'Renode Monitor',
    'Renode Logs',
    'sysbus.usart3 (nucleo)',
    'sysbus.usart2 (nucleo)',
  ]) {
    await expect(tabs.getByText(name, { exact: true })).toBeVisible();
  }
});

test('monitor terminal works', async ({ app, workbench: page }) => {
  await startDebugging(page);

  await typeInto(page, 'Renode Monitor', 'mach\r');
  await expect
    .poll(() => terminalText(app, page, 'Renode Monitor'))
    .toContain('Current machine: nucleo');
});

test.fixme('logs terminal works', async ({ app, workbench: page }) => {
  // The terminal stops after the first few lines ("System bus created."), while Renode logs much more
  await startDebugging(page);

  await expect
    .poll(() => terminalText(app, page, 'Renode Logs'))
    .toContain('GDB server with all CPUs started');
});

// After the command, continuing stops right away again on reset.S ("reason pause"), the emulation itself is not cleared
test.fixme(
  'connecting again keeps the debug session',
  async ({ app, workbench: page }) => {
    await startDebugging(page);

    await runCommand(page, 'Renode: Connect to session');
    await page.keyboard.press('F5');
    await expect(page.getByRole('button', { name: /^Pause/ })).toBeVisible();

    await typeInto(page, 'sysbus.usart3 (nucleo)', 'Renode');
    await expect
      .poll(() => terminalText(app, page, 'sysbus.usart2 (nucleo)'))
      .toContain('Renode');
  },
);
