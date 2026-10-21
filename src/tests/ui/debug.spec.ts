// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import {
  quickInput,
  runCommand,
  startDebugging,
  terminalText,
  typeInto,
} from './utils';

// Follows examples/README.md
test('debugging the demo', async ({ app, workbench: page }) => {
  const editor = page.locator('.editor-instance');

  await test.step('start debugging', async () => {
    await startDebugging(page);
    // Stopped on reset, the source is found through pathMappings
    await expect(page.getByRole('tab', { name: 'reset.S' })).toBeVisible();
  });

  await test.step('set a breakpoint in main.c', async () => {
    await quickInput(page, 'Control+P', 'passthrough/src/main.c', 'main.c');
    await expect(page.getByRole('tab', { name: 'main.c' })).toBeVisible();
    await quickInput(page, 'Control+G', ':79', '79');
    await page.keyboard.press('F9');
    await expect(editor.locator('.codicon-debug-breakpoint')).toBeVisible();
    await page.keyboard.press('F5');
    await expect(page.getByRole('button', { name: /^Pause/ })).toBeVisible();
  });

  await test.step('typing into usart3 hits the breakpoint', async () => {
    await typeInto(page, 'sysbus.usart3 (nucleo)', 'x');
    await expect(
      page.getByRole('button', { name: /^Step Over/ }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'main.c' })).toBeVisible();
    await expect(editor.locator('.debug-top-stack-frame-line')).toBeVisible();
  });

  await test.step('continuing passes the input to usart2', async () => {
    await runCommand(page, 'Remove All Breakpoints');
    await expect(editor.locator('.codicon-debug-breakpoint')).toHaveCount(0);
    await page.keyboard.press('F5');
    await expect(page.getByRole('button', { name: /^Pause/ })).toBeVisible();

    await typeInto(page, 'sysbus.usart3 (nucleo)', 'Renode');
    await expect
      .poll(() => terminalText(app, page, 'sysbus.usart2 (nucleo)'))
      .toContain('xRenode');
  });

  await test.step('stop debugging', async () => {
    await page.keyboard.press('Shift+F5');
    await expect(page.getByRole('button', { name: /^Pause/ })).toBeHidden();
  });
});
