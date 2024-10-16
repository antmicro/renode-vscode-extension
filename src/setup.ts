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

const RENODE_LINUX_URL =
  'https://builds.renode.io/renode-latest.linux-portable-dotnet.tar.gz';
const RENODE_WINDOWS_URL =
  'https://builds.renode.io/renode-latest.windows-portable-dotnet.zip';
const WS_PROXY_URL = 'git+https://github.com/antmicro/renode-ws-proxy.git';

export class RenodeSetup {
  // Holds platform specific paths
  readonly storagePath: vscode.Uri;
  readonly renodeArchivePath: vscode.Uri;
  readonly renodeUrl: string;
  readonly venvBinPath: vscode.Uri;
  private wsProxyBinPath: vscode.Uri;
  private renodeBinPath: vscode.Uri;
  private defaultGDB: string;

  constructor(ctx: vscode.ExtensionContext) {
    this.storagePath = ctx.globalStorageUri;
    // Platform specific paths
    if (process.platform === 'win32') {
      this.renodeBinPath = vscode.Uri.joinPath(
        this.storagePath,
        '/bin/Renode.exe',
      );
      this.renodeArchivePath = vscode.Uri.joinPath(
        this.storagePath,
        'renode-latest.zip',
      );
      this.venvBinPath = vscode.Uri.joinPath(this.storagePath, 'venv/Scripts');
      this.renodeUrl = RENODE_WINDOWS_URL;
      this.wsProxyBinPath = vscode.Uri.joinPath(
        this.venvBinPath,
        'renode-ws-proxy.exe',
      );
    } else {
      this.renodeBinPath = vscode.Uri.joinPath(this.storagePath, 'renode');
      this.renodeArchivePath = vscode.Uri.joinPath(
        this.storagePath,
        'renode-portable-dotnet.tar.gz',
      );
      this.renodeUrl = RENODE_LINUX_URL;
      this.venvBinPath = vscode.Uri.joinPath(this.storagePath, 'venv/bin');
      this.wsProxyBinPath = vscode.Uri.joinPath(
        this.venvBinPath,
        'renode-ws-proxy',
      );
    }

    this.defaultGDB = 'gdb-multiarch';
  }

  async setup(): Promise<vscode.Disposable> {
    const cfg = vscode.workspace.getConfiguration('renode');
    if (!cfg?.get<boolean>('automaticWSProxyManagement')) {
      // Automatic proxy manegement is disbled, so nothing needs to be done here
      return { dispose: () => {} };
    }
    // Make sure the extensions globalStorage directory is created
    await fs.mkdir(this.storagePath.fsPath, { recursive: true });
    // Find or download Renode and WS proxy
    const renode = this.getRenode();
    const wsProxy = this.getWSProxy();
    const defaultGDB = this.getDefaultGDB();

    try {
      // Wait for dependancies to be ready
      await Promise.all([renode, wsProxy, defaultGDB]);
    } catch (error) {
      if (error instanceof Error) {
        const settings_message = 'Open extension settings';
        vscode.window
          .showErrorMessage(error.message, settings_message, 'Abort')
          .then(value => {
            if (value === settings_message) {
              vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'renode',
              );
            }
          });
      } else {
        // All normal errors should be handled by the above code, this is a fallback
        vscode.window.showErrorMessage(
          `Unexpected error in RenodeSetup: ${String(error)}`,
        );
      }
      // One or more components not avaible, so setup can't procede
      return { dispose: () => {} };
    }

    // All requirements are now located, and already awaited
    this.renodeBinPath = await renode;
    this.wsProxyBinPath = await wsProxy;
    this.defaultGDB = await defaultGDB;

    const wsProxyOut = vscode.window.createOutputChannel('Renode WS Proxy');

    const wsProxyProc: ChildProcess = childprocess.spawn(
      this.wsProxyBinPath.fsPath,
      [this.renodeBinPath.fsPath, '.', '-g', this.defaultGDB],
      { cwd: this.storagePath.fsPath, stdio: 'pipe' },
    );

    wsProxyProc.stdout?.on('data', data => wsProxyOut.append(data.toString()));
    wsProxyProc.stderr?.on('data', data => wsProxyOut.append(data.toString()));

    // Anything that needs to be cleaned up on exit (i.e. killing ws-proxy) goes here
    return {
      dispose: async () => {
        wsProxyProc?.kill();
      },
    };
  }

  // Returns the path to the renode binary, fetches it if it does not exists
  async getRenode(): Promise<vscode.Uri> {
    let renodePath = this.renodeBinPath;

    const cfg = vscode.workspace.getConfiguration('renode');
    const customRenodePath = cfg?.get<string>('customRenodePath');
    if (customRenodePath) {
      renodePath = vscode.Uri.parse(customRenodePath);
    }
    const res = spawnSync(renodePath.fsPath, ['--version'], {});
    if (!res.error) {
      // Working renode found
      return renodePath;
    } else {
      // Renode not found
      if (customRenodePath) {
        // User specified a wrong path, so throw an error
        throw new Error(`Could not find Renode at ${customRenodePath}`);
      }
      // Download Renode to extension storage
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Downloading Renode',
        },
        async (
          progress: vscode.Progress<any>,
          token: vscode.CancellationToken,
        ) => {
          await downloadFile(this.renodeUrl, this.renodeArchivePath.fsPath);
        },
      );
      // Extract the portable release
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
      return renodePath;
    }
  }

  async getWSProxy(): Promise<vscode.Uri> {
    let wsProxyPath = this.wsProxyBinPath;

    const cfg = vscode.workspace.getConfiguration('renode');
    const customWSPath = cfg?.get<string>('customWSProxyPath');
    if (customWSPath) {
      wsProxyPath = vscode.Uri.parse(customWSPath);
    }
    const res = spawnSync(wsProxyPath.fsPath, ['-h'], {});
    if (!res.error) {
      // Working WS Proxy found
      return wsProxyPath;
    } else {
      if (customWSPath) {
        // User specified a wrong path, so throw an error
        throw new Error(`Could not find Renode WS Proxy at ${wsProxyPath}`);
      }
      // Download WS Proxy
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Renode WebSocket Proxy not found, downloading',
        },
        async (
          progress: vscode.Progress<any>,
          token: vscode.CancellationToken,
        ) => {
          const venv_res = spawnSync('python', ['-m', 'venv', 'venv'], {
            cwd: this.storagePath.fsPath,
            stdio: 'pipe',
          });
          if (venv_res.error) {
            throw new Error(
              'python not found, please make sure it is installed and in your PATH',
            );
          }
          spawnSync('./pip', ['install', WS_PROXY_URL], {
            cwd: this.venvBinPath.fsPath,
            stdio: 'ignore',
          });
        },
      );
      return wsProxyPath;
    }
  }

  async getDefaultGDB(): Promise<string> {
    // Read default GDB from settings
    const cfg = vscode.workspace.getConfiguration('renode');
    const defaultGDBConfig = cfg?.get<string>('defaultGDB');
    // Should be set by default
    let defaultGDB = defaultGDBConfig ?? 'gdb-multiarch';
    const res = spawnSync(defaultGDB, ['--version'], {});
    if (!res.error) {
      // Working gdb found
      return defaultGDB;
    } else {
      throw new Error(
        `${defaultGDB} not found, please set settings.renode.defaultGDB to to a valid value`,
        { cause: 'renode.defaultGDB' },
      );
    }
  }
}
async function downloadFile(from: string, to: string) {
  const resp = await fetch(from);
  const out = await fs.open(to, 'w', 0o777);
  const outs = out.createWriteStream();
  await finished(Readable.fromWeb(resp.body! as any).pipe(outs));
}
