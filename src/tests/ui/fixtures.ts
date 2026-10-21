// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  test as base,
  _electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { runCommand } from './utils';

const ROOT = path.resolve(__dirname, '../../..');
export const EXAMPLES = path.join(ROOT, 'examples');

const SETTINGS = {
  // Renode is started by the `renode` fixture, so its output can be attached to the report
  'renode.autoStartRenode': false,
  // Use the DOM renderer, so the terminal contents can be read
  'terminal.integrated.gpuAcceleration': 'off',
  'security.workspace.trust.enabled': false,
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'update.mode': 'none',
  'extensions.autoUpdate': false,
  'telemetry.telemetryLevel': 'off',
  'chat.disableAIFeatures': true,
  'git.enabled': false,
};

export const test = base.extend<{
  renode: void;
  app: ElectronApplication;
  workbench: Page;
}>({
  renode: async ({}, use, testInfo) => {
    const renodePath = process.env.RENODE_PATH!;
    const logPath = testInfo.outputPath('renode.log');
    const log = createWriteStream(logPath);
    const proc = spawn(renodePath, ['--server-mode'], {
      cwd: path.dirname(renodePath),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stderr.pipe(log, { end: false });

    await new Promise<void>((resolve, reject) => {
      let output = '';
      proc.once('exit', code => reject(new Error(`Renode exited (${code})`)));
      proc.stdout.on('data', (chunk: Buffer) => {
        log.write(chunk);
        output += chunk.toString();
        if (output.includes('Loaded monitor commands')) {
          resolve();
        }
      });
    });

    await use();

    await new Promise(resolve => {
      proc.once('close', resolve);
      process.kill(-proc.pid!, 'SIGTERM');
    });
    await new Promise(resolve => log.end(resolve));
    await testInfo.attach('renode-log', {
      path: logPath,
      contentType: 'text/plain',
    });
  },

  app: async ({ renode }, use, testInfo) => {
    const userDataDir = testInfo.outputPath('user-data');
    await fs.mkdir(path.join(userDataDir, 'User'), { recursive: true });
    await fs.writeFile(
      path.join(userDataDir, 'User', 'settings.json'),
      JSON.stringify(SETTINGS),
    );

    // Running VS Code from a VS Code terminal makes it talk to the parent instance,
    // and with WAYLAND_DISPLAY set it opens on the Wayland desktop instead of $DISPLAY (e.g. xvfb)
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.startsWith('VSCODE_') &&
          key !== 'ELECTRON_RUN_AS_NODE' &&
          key !== 'WAYLAND_DISPLAY',
      ),
    ) as Record<string, string>;

    const app = await _electron.launch({
      executablePath: process.env.VSCODE_PATH!,
      env,
      args: [
        EXAMPLES,
        `--extensionDevelopmentPath=${ROOT}`,
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${testInfo.outputPath('extensions')}`,
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        '--no-sandbox',
        '--disable-gpu',
        '--ozone-platform=x11',
      ],
    });
    await app.context().tracing.start({
      screenshots: true,
      snapshots: true,
      title: testInfo.title,
    });

    await use(app);

    const tracePath = testInfo.outputPath('trace.zip');
    await app.context().tracing.stop({ path: tracePath });
    await testInfo.attach('trace', {
      path: tracePath,
      contentType: 'application/zip',
    });
    await app.close();
  },

  workbench: async ({ app }, use) => {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1600, 1000),
    );
    await page.locator('.monaco-workbench').waitFor();
    // Keys pressed before the extension is up get lost, e.g. F5 on a cold start
    await page.getByText('Renode Session Connected').waitFor();
    // Only errors get a popup then, so info notifications don't cover anything
    await runCommand(page, 'Notifications: Toggle Do Not Disturb Mode');
    await use(page);
  },
});

export { expect } from '@playwright/test';
