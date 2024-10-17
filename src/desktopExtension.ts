// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as utils from './utils';
import { LaunchRequestArguments, RenodeGdbDebugSession } from './program/gdb';
import { activateExtension } from './extensionActivate';
import { RenodeSetup } from './setup';
import { setTimeout } from 'timers/promises';

// Entry point for the desktop version of the extension
export async function activate(context: vscode.ExtensionContext) {
  activateExtension(context);
  // Logic specific to the desktop version goes here
  let setup = new RenodeSetup(context);
  setup.setup().then(disposable => {
    context.subscriptions.push(disposable);
    // Wait 500ms for WS proxy to have time to start, and then try to connect
    setTimeout(500).then(() => {
      vscode.commands.executeCommand('renode.sessionConnect');
    });
  });
}

export function deactivate() {}

export { LaunchRequestArguments as RenodeLaunchRequestArguments, utils };
