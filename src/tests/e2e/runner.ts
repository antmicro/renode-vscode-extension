// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import path from 'path';
import fs from 'fs';
import * as vscodeTest from '@vscode/test-web';
import { spawn, spawnSync, SpawnSyncReturns } from 'child_process';
import { tryConnectWs } from '../../utils';
import { tmpdir } from 'os';

const wsProxyPath = process.env['WS_PROXY_DIR'] ?? './renode-ws-proxy';
const gdbBin = process.env['GDB_BIN'] ?? 'gdb-multiarch';
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

function commandExists(cmd: string) {
  try {
    const res = spawnSync(cmd, ['-V']);
    return res.error === undefined;
  } catch {
    return false;
  }
}

function getCommandError(res: SpawnSyncReturns<Buffer>): string | undefined {
  if (res.error) {
    return res.error.message;
  } else if (res.status !== 0) {
    return res.stderr.toString();
  } else {
    return undefined;
  }
}

function prepareWsProxy() {
  console.log('ws-proxy is not running. Trying to start it');
  if (!renodePath) {
    throw new Error(
      'RENODE_PATH variable not set. Set it before starting the test runner, or start ws-proxy manually.',
    );
  }

  const pythonBin = (() => {
    if (commandExists('python3')) {
      return 'python3';
    } else if (commandExists('python')) {
      return 'python';
    } else {
      throw new Error('Python not found in PATH');
    }
  })();
  console.log('Found python:', pythonBin);

  const pipBin = (() => {
    if (commandExists('pip3')) {
      return ['pip3'];
    } else if (commandExists('pip')) {
      return ['pip'];
    } else {
      return [pythonBin, '-m', 'pip'];
    }
  })();
  console.log('Found pip:', pipBin);

  if (!wsProxyPath || !fs.existsSync(wsProxyPath)) {
    console.log('ws-proxy clone not found. Trying to clone');
    if (!commandExists('git')) {
      throw new Error(
        'Cannot clone ws-proxy automatically because git was not found.\n' +
          'Install git, or download/clone ws-proxy manually and set WS_PROXY_DIR environment variable',
      );
    }

    const res = spawnSync('git', [
      'clone',
      '--depth=1',
      'https://github.com/antmicro/renode-ws-proxy.git',
    ]);
    const err = getCommandError(res);
    if (err !== undefined) {
      throw new Error(`git returned an error while cloning ws-proxy: ${err}`);
    }
  }

  const realWsProxyPath = fs.realpathSync(wsProxyPath);
  console.log('Installing python dependencies');
  const pipRes = spawnSync(
    pipBin[0],
    [...pipBin.slice(1), 'install', '-I', '.'],
    {
      cwd: realWsProxyPath,
    },
  );
  const pipErr = getCommandError(pipRes);
  if (pipErr !== undefined) {
    throw new Error(
      `pip returned an error while installing dependencies: ${pipErr}`,
    );
  }

  const workdir = fs.mkdtempSync(path.join(tmpdir(), 'ext-test-proxy-'));
  console.log('Starting ws-proxy');
  const proc = spawn(
    pythonBin,
    ['renode_ws_proxy/ws_proxy.py', renodePath, workdir, gdbBin],
    {
      cwd: realWsProxyPath,
    },
  );

  return new Promise<{ stop: () => void }>((resolve, reject) => {
    proc.on('spawn', () => {
      setTimeout(
        () =>
          resolve({
            stop: () => {
              proc.kill();
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
            `ws-proxy errored while spawning: ${proc.stderr?.read()?.toString() ?? ''}`,
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
    proxyProcess = await prepareWsProxy();
  }

  const workdir = fs.mkdtempSync(path.join(tmpdir(), 'ext-test-vscode-'));
  try {
    await vscodeTest.runTests({
      browserType: 'chromium',
      extensionDevelopmentPath,
      extensionTestsPath,
      browserOptions: localBrowser ? ['--headless=new'] : [],
      folderPath: workdir,
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
      Only try to connect to an already running ws-proxy instance,
      without trying to start one.
      By default the runner will connect to a running proxy
      if it detects one regardless of this flag

  --localBrowser
      Instead of using playwright's browser, start chromedriver
      and use that for tests. Requires chromedriver and chrome in PATH.

Warning:
  The test runner will, by default, try to clone ws-proxy,
  and install all the python dependencies.
  If you don't want them to get installed globally,
  start ws-proxy on the default port before starting tests,
  or enter python venv.

Environment variables:
  WS_PROXY_DIR
      Specifies the directory where ws-proxy is or should be cloned.

  GDB_BIN
      Path to gdb that will be passed to ws-proxy. Defaults to gdb-multiarch.

  RENODE_PATH
      Path to renode that will be passed to ws-proxy.
`);
} else {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
