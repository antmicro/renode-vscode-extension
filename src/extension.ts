// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as utils from './utils';
import { LaunchRequestArguments, RenodeGdbDebugSession } from './program/gdb';
import { registerConsoleCommands } from './program/consoleCommand';
import { RenodePluginContext } from './context';

export function activate(context: vscode.ExtensionContext) {
  console.log('Renode extension loaded');

  let ctx = new RenodePluginContext();
  context.subscriptions.push(ctx);
  registerConsoleCommands(context.subscriptions, ctx);

  const adapterDisposable = vscode.debug.registerDebugAdapterDescriptorFactory(
    'renodegdb',
    {
      async createDebugAdapterDescriptor(_session, _executable) {
        return new vscode.DebugAdapterInlineImplementation(
          new RenodeGdbDebugSession(ctx),
        );
      },
    },
  );
  context.subscriptions.push(adapterDisposable);

  context.subscriptions.push(
    vscode.commands.registerCommand('renode.mountFolder', () => {
      vscode.workspace.updateWorkspaceFolders(0, 0, {
        name: 'Renode Outputs',
        uri: vscode.Uri.parse('renodehyp:/'),
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('renode.unmountFolder', () => {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const idx = folders.findIndex(
        folder => folder.uri.scheme === 'renodehyp',
      );
      if (idx !== -1) {
        vscode.workspace.updateWorkspaceFolders(idx, 1);
      }
    }),
  );
}

export function deactivate() {}

export { LaunchRequestArguments as RenodeLaunchRequestArguments, utils };
