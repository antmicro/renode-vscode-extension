// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import stream, { Readable } from 'stream';
import childprocess, { ChildProcess } from 'child_process';
import { promisify } from 'util';
import { spawnSync } from 'child_process';
import { RenodePluginContext } from './context';
const finished = promisify(stream.finished);

const RENODE_URL =
  'https://builds.renode.io/renode-latest.linux-portable-dotnet.tar.gz';
const WS_PROXY_URL = 'git+https://github.com/antmicro/renode-ws-proxy.git';
const RENODE_ARCHIVE = 'renode-portable.tar.gz';

export class RenodeSetup {
  readonly storagePath: vscode.Uri;
  private wsProxyBinPath: vscode.Uri;
  private renodeBinPath: vscode.Uri;
  private renodeArchivePath: vscode.Uri;

  constructor(ctx: vscode.ExtensionContext) {
    this.storagePath = ctx.globalStorageUri;
    this.renodeBinPath = vscode.Uri.joinPath(this.storagePath, 'renode');
    this.renodeArchivePath = vscode.Uri.joinPath(
      this.storagePath,
      RENODE_ARCHIVE,
    );
    this.wsProxyBinPath = vscode.Uri.joinPath(
      this.storagePath,
      'venv/bin/renode-ws-proxy',
    );
  }

  async setup(): Promise<vscode.Disposable> {
    const cfg = vscode.workspace.getConfiguration('renode');
    if (!cfg?.get<boolean>('automaticWSProxyManagement')) {
      // Automatic proxy manegement is disbled, so nothing needs to be done here
      return { dispose: () => {} };
    }
    const customRenodePath = cfg?.get<string>('customRenodePath');
    if (customRenodePath) {
      // Custom Renode binary path set, check if it works
      const res = spawnSync(customRenodePath, ['--version'], {});
      if (res.error) {
        vscode.window.showErrorMessage(
          `Could not find Renode at ${customRenodePath}`,
        );
        return { dispose: () => {} };
      }
      this.renodeBinPath = vscode.Uri.parse(customRenodePath);
    }
    const customWSPath = cfg?.get<string>('customWSProxyPath');
    if (customWSPath) {
      // Custom Renode binary path set, check if it works
      const res = spawnSync(customWSPath, ['-h'], {});
      if (res.error) {
        vscode.window.showErrorMessage(
          `Could not find Renode WS Proxy at ${customWSPath}`,
        );
        return { dispose: () => {} };
      }
      this.wsProxyBinPath = vscode.Uri.parse(customWSPath);
    }
    // Download renode and ws proxy if they are not found
    await fs.mkdir(this.storagePath.fsPath, { recursive: true });
    const renode = this.getRenode();
    const wsProxy = this.getWSProxy();

    await Promise.all([renode, wsProxy]);

    const wsProxyOut = vscode.window.createOutputChannel('Renode WS Proxy');

    const wsProxyProc: ChildProcess = childprocess.spawn(
      await wsProxy,
      [this.renodeBinPath.fsPath, '.', '-g', '/usr/bin/gdb'],
      { cwd: this.storagePath.fsPath, stdio: 'pipe' },
    );

    wsProxyProc.stdout?.on('data', data => wsProxyOut.append(data.toString()));
    wsProxyProc.stderr?.on('data', data => wsProxyOut.append(data.toString()));

    // Anything that needs to be cleaned up on exit (e.g killing ws-proxy) goes here
    return {
      dispose: async () => {
        wsProxyProc?.kill();
      },
    };
  }

  // Returns the path to the renode binary, fetches it if it does not exists
  async getRenode(): Promise<string> {
    // Check if renode binary exists
    try {
      await fs.access(this.renodeBinPath.fsPath);
      return this.renodeBinPath.fsPath;
    } catch {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Renode not found, downloading',
        },
        async (
          progress: vscode.Progress<any>,
          token: vscode.CancellationToken,
        ) => {
          await downloadFile(RENODE_URL, this.renodeArchivePath.fsPath);
        },
      );
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Extracting Renode',
        },
        async (
          progress: vscode.Progress<any>,
          token: vscode.CancellationToken,
        ) => {
          spawnSync(
            'tar',
            ['--strip-components', '1', '-xf', this.renodeArchivePath.fsPath],
            { cwd: this.storagePath.fsPath, stdio: 'ignore' },
          );
        },
      );
      return this.renodeArchivePath.fsPath;
    }
  }

  async getWSProxy(): Promise<string> {
    if (await fileExists(this.wsProxyBinPath.fsPath)) {
      return this.wsProxyBinPath.fsPath;
    } else {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Renode WebSocket Proxy not found, downloading',
        },
        async (
          progress: vscode.Progress<any>,
          token: vscode.CancellationToken,
        ) => {
          spawnSync('python3', ['-m', 'venv', 'venv'], {
            cwd: this.storagePath.fsPath,
            stdio: 'ignore',
          });
          spawnSync('./pip', ['install', WS_PROXY_URL], {
            cwd: vscode.Uri.joinPath(this.storagePath, '/venv/bin').fsPath,
            stdio: 'ignore',
          });
        },
      );
      return this.wsProxyBinPath.fsPath;
    }
  }
}
async function downloadFile(from: string, to: string) {
  const resp = await fetch(from);
  const out = await fs.open(to, 'w', 0o777);
  const outs = out.createWriteStream();
  await finished(Readable.fromWeb(resp.body! as any).pipe(outs));
}
