// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as utils from './utils';
import { LaunchRequestArguments } from './program/gdb';
import { activateExtension } from './extensionActivate';
import { RenodeSetup } from './setup';

// Entry point for the desktop version of the extension
export async function activate(context: vscode.ExtensionContext) {
  activateExtension(context);

  // Logic specific to the desktop version goes here
  let setup = new RenodeSetup(context);
  setup.setup().then(disposable => {
    context.subscriptions.push(disposable);
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(setup.settingsChange, setup),
    );

    vscode.commands.executeCommand('renode.sessionConnect');
  });
}

export function deactivate() {}

export { LaunchRequestArguments as RenodeLaunchRequestArguments, utils };
