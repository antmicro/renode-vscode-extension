// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import stream, { Readable } from 'stream';
import childprocess, { ChildProcess } from 'child_process';
import { promisify } from 'util';
import { spawnSync } from 'child_process';
const finished = promisify(stream.finished);

const RENODE_LINUX_URL =
  'https://builds.renode.io/renode-latest.linux-portable-dotnet.tar.gz';
const RENODE_WINDOWS_URL =
  'https://builds.renode.io/renode-latest.windows-portable-dotnet.zip';

export class RenodeSetup {
  // Holds platform specific paths
  readonly globalStoragePath: vscode.Uri;
  readonly renodeArchivePath: vscode.Uri;
  readonly renodeUrl: string;
  private renodeBinPath: vscode.Uri;
  private defaultGDB: string;
  private renodeProc?: ChildProcess;

  constructor(ctx: vscode.ExtensionContext) {
    this.globalStoragePath = ctx.globalStorageUri;
    // Platform specific paths, vscode.Uri handles converting path separators
    if (process.platform === 'win32') {
      this.renodeBinPath = vscode.Uri.joinPath(
        this.globalStoragePath,
        'Renode.exe',
      );
      this.renodeArchivePath = vscode.Uri.joinPath(
        this.globalStoragePath,
        'renode-latest.zip',
      );
      this.renodeUrl = RENODE_WINDOWS_URL;
    } else {
      this.renodeBinPath = vscode.Uri.joinPath(
        this.globalStoragePath,
        'renode',
      );
      this.renodeArchivePath = vscode.Uri.joinPath(
        this.globalStoragePath,
        'renode-portable-dotnet.tar.gz',
      );
      this.renodeUrl = RENODE_LINUX_URL;
    }

    this.defaultGDB = 'gdb-multiarch';
  }

  async setup(): Promise<vscode.Disposable> {
    const cfg = vscode.workspace.getConfiguration('renode');
    if (!cfg?.get<boolean>('autoStartRenode')) {
      // Automatic renode management is disabled, so nothing needs to be done here
      return { dispose: () => {} };
    }
    // Make sure the extensions globalStorage directory is created
    await fs.mkdir(this.globalStoragePath.fsPath, { recursive: true });
    // Find or download Renode
    const renode = this.getRenode();
    const defaultGDB = this.getDefaultGDB();

    try {
      // Wait for dependancies to be ready
      await Promise.all([renode, defaultGDB]);
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
    this.defaultGDB = await defaultGDB;

    var spawnOptions: childprocess.SpawnOptionsWithoutStdio = {
      cwd: this.globalStoragePath.fsPath,
    };
    if (process.platform !== 'win32') {
      spawnOptions.detached = true; // Separates spawned program into separate group
    }

    this.renodeProc = childprocess.spawn(
      this.renodeBinPath.fsPath,
      ['--server-mode'],
      spawnOptions,
    );

    // Anything that needs to be cleaned up on exit (i.e. killing renode) goes here
    return {
      dispose: async () => {
        this.disposeRenode();
      },
    };
  }

  async disposeRenode() {
    if (this.renodeProc !== undefined) {
      if (process.platform === 'win32') {
        this.renodeProc.kill();
      } else {
        process.kill(-this.renodeProc.pid!); // Kills the whole process group that process with pid belongs to
      }
      this.renodeProc = undefined;
    }
  }

  async settingsChange(event: vscode.ConfigurationChangeEvent) {
    if (
      event.affectsConfiguration('renode.customRenodePath') ||
      event.affectsConfiguration('renode.autoStartRenode')
    ) {
      await this.disposeRenode();
      await this.setup();
    }
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
            { cwd: this.globalStoragePath.fsPath, stdio: 'ignore' },
          );
        },
      );
      return renodePath;
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
      // On some systems with very new gdb versions (e.g. Arch Linux) gdb-multiarch is now just called gdb
      // so check if that works and update default setting in that case
      if (defaultGDB === 'gdb-multiarch') {
        const res = spawnSync('gdb', ['--version'], {});
        if (!res.error) {
          // gdb works, when gdb-multiarch did not, so update setting
          cfg.update('defaultGDB', 'gdb', vscode.ConfigurationTarget.Global);
          return 'gdb';
        }
        // Else we just throw and inform the user that gdb is missing
      }
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
