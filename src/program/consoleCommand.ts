// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { RenodePluginContext } from '../context';
import { createRenodeWebSocketTerminal } from '../console';

export function registerConsoleCommands(
  subscriptions: any[],
  pluginCtx: RenodePluginContext,
) {
  const initialPort = 29170;
  const uartCommand = vscode.commands.registerCommand(
    'renode.openUartConsole',
    openUartConsoleCommandHandler.bind({ lastPort: initialPort }, pluginCtx),
  );
  subscriptions.push(uartCommand);

  const logsCommand = vscode.commands.registerCommand(
    'renode.openLogs',
    openLogsConsoleCommandHandler.bind({ logsPort: initialPort }, pluginCtx),
  );
  subscriptions.push(logsCommand);
}

async function openUartConsoleCommandHandler(
  this: { lastPort: number },
  pluginCtx: RenodePluginContext,
) {
  if (!pluginCtx.socketReady) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  const parentName = '..';
  let machineName: string | undefined;
  let uartName: string | undefined;

  while (machineName === undefined || uartName === undefined) {
    if (machineName === undefined) {
      machineName = await vscode.window.showQuickPick(pluginCtx.getMachines(), {
        canPickMany: false,
        ignoreFocusOut: true,
        title: 'machine - Console selection',
      });
    } else {
      uartName = await vscode.window.showQuickPick(
        pluginCtx
          .getUarts(machineName)
          .then(uarts => [parentName].concat(uarts)),
        {
          canPickMany: false,
          ignoreFocusOut: true,
          title: 'UART - Console selection',
        },
      );
      if (uartName === parentName) {
        machineName = undefined;
        uartName = undefined;
      }
    }
  }

  // TODO: add protocol support for ws endpoint creation with uart terminal
  this.lastPort += 1;
  let monitorCommands = [
    `mach set "${machineName}"`,
    `emulation CreateServerSocketTerminal ${this.lastPort} "sst-${this.lastPort}"`,
    `sst-${this.lastPort} AttachTo sysbus.${uartName}`,
  ];

  await pluginCtx.execMonitor(monitorCommands);
  const term = createRenodeWebSocketTerminal(
    `${uartName} (${machineName})`,
    `${pluginCtx.sessionBase}/telnet/${this.lastPort}`,
  );
  term.show(false);
  pluginCtx.onPreDisconnect(() => {
    term.dispose();
  });
}

function openLogsConsoleCommandHandler(
  this: { logsPort: number },
  pluginCtx: RenodePluginContext,
) {
  if (!pluginCtx.socketReady) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  const term = createRenodeWebSocketTerminal(
    `Renode`,
    `${pluginCtx.sessionBase}/telnet/${this.logsPort}`,
    true,
  );
  term.show(false);
  pluginCtx.onPreDisconnect(() => {
    term.dispose();
  });
}
