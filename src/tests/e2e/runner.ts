// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import path from 'path';
import fs from 'fs';
import * as vscodeTest from '@vscode/test-web';
import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { tryConnectWs } from '../../utils';
import { tmpdir } from 'os';

const renodePath = process.env['RENODE_PATH'];
const localProxy = process.argv.includes('--localProxy');
const localBrowser = process.argv.includes('--localBrowser');
const SELENIUM_PORT = 9515;

async function isProxyRunning() {
  try {
    const sock = await tryConnectWs('ws://127.0.0.1:21234/proxy');
    sock.close();
  } catch {
    return false;
  }
  return true;
}

function prepareRenode() {
  console.log('Renode is not running. Trying to start it');
  if (!renodePath) {
    throw new Error(
      'RENODE_PATH variable not set. Set it before starting the test runner, or start Renode manually.',
    );
  }

  console.log('Starting Renode');

  const workdir = fs.mkdtempSync(path.join(tmpdir(), 'ext-test-renode-'));
  var spawnOptions: SpawnOptionsWithoutStdio = {
    cwd: workdir,
  };
  if (process.platform !== 'win32') {
    spawnOptions.detached = true; // Required to kill whole process group on Unix systems
  }

  const proc = spawn(renodePath, ['--server-mode'], spawnOptions);

  return new Promise<{ stop: () => void }>((resolve, reject) => {
    proc.on('spawn', () => {
      setTimeout(
        () =>
          resolve({
            stop: () => {
              if (process.platform === 'win32') {
                proc.kill();
              } else {
                process.kill(-proc.pid!);
              }
              fs.rmSync(workdir, {
                recursive: true,
                force: true,
              });
            },
          }),
        2_000,
      );
    });

    proc.on('exit', code => {
      if (code) {
        fs.rmSync(workdir, {
          recursive: true,
          force: true,
        });
        reject(
          new Error(
            `renode errored while spawning: ${proc.stderr?.read()?.toString() ?? ''}`,
          ),
        );
      }
    });
  });
}

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './index.js');

  let browserProcess;
  if (localBrowser) {
    browserProcess = spawn('chromedriver', [`--port=${SELENIUM_PORT}`], {
      stdio: 'pipe',
    });
    process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
    process.env.SELENIUM_REMOTE_URL = `http://localhost:${SELENIUM_PORT}`;
  }

  const dontStartProxy = localProxy || (await isProxyRunning());
  let proxyProcess;
  if (!dontStartProxy) {
    proxyProcess = await prepareRenode();
  }

  const workdir = fs.mkdtempSync(path.join(tmpdir(), 'ext-test-vscode-'));
  try {
    await vscodeTest.runTests({
      browserType: 'chromium',
      extensionDevelopmentPath,
      extensionTestsPath,
      browserOptions: localBrowser ? ['--headless=new'] : [],
      folderPath: workdir,
      quality: 'stable',
    });
  } catch (e) {
    throw e;
  } finally {
    browserProcess?.kill();
    proxyProcess?.stop();
    fs.rmSync(workdir, {
      recursive: true,
      force: true,
    });
  }
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: runner [OPTIONS]

Options:
  --localProxy
      Only try to connect to an already running Renode instance,
      without trying to start one.
      By default the runner will connect to a running Renode
      if it detects one regardless of this flag

  --localBrowser
      Instead of using playwright's browser, start chromedriver
      and use that for tests. Requires chromedriver and chrome in PATH.

Warning:
  The test runner currently requires Renode to be already installed on the system.

Environment variables:
  RENODE_PATH
      Path to Renode.
`);
} else {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
