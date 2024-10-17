// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as utils from './utils';
import { LaunchRequestArguments, RenodeGdbDebugSession } from './program/gdb';
import { activateExtension } from './extensionActivate';

// Entry point for the web version of the extension
export function activate(context: vscode.ExtensionContext) {
  activateExtension(context);
  // Any startup logic specific to the web plugin goes here
}

export function deactivate() {}

export { LaunchRequestArguments as RenodeLaunchRequestArguments, utils };
