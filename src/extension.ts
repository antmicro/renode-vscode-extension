// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as utils from './utils';
import { LaunchRequestArguments, RenodeGdbDebugSession } from './program/gdb';
import { registerConsoleCommands } from './program/consoleCommand';
import { SensorsViewProvider } from './program/sensorsWebview';
import { RenodePluginContext } from './context';
import { RenodeSetup } from './setup';

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

  const sensorProvider = new SensorsViewProvider(context, ctx);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SensorsViewProvider.viewType,
      sensorProvider,
    ),
  );

  const trackerFactory: vscode.DebugAdapterTrackerFactory = {
    createDebugAdapterTracker(session: vscode.DebugSession) {
      return {
        onDidSendMessage: message => {
          if (message.type === 'event') {
            switch (message.event) {
              case 'initialized':
              case 'terminated':
              case 'exited':
                // Reload the sensor WebView
                sensorProvider.loadSensorsData();
                break;
              default:
                // no action
                break;
            }
          }
        },
      };
    },
  };

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory(
      'renodegdb',
      trackerFactory,
    ),
  );
  let setup = new RenodeSetup(context);
  setup.setup().then(disposable => {
    context.subscriptions.push(disposable);
  });
}

export function deactivate() {}

export { LaunchRequestArguments as RenodeLaunchRequestArguments, utils };
