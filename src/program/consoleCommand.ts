// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { RenodePluginContext, INITIAL_PORT } from '../context';
import { createRenodeWebSocketTerminal } from '../console';

export function registerConsoleCommands(
  subscriptions: any[],
  pluginCtx: RenodePluginContext,
) {
  const uartCommand = vscode.commands.registerCommand(
    'renode.openUartConsole',
    openUartConsoleCommandHandler.bind(undefined, pluginCtx),
  );
  subscriptions.push(uartCommand);

  const allUartsCommand = vscode.commands.registerCommand(
    'renode.openAllUartConsoles',
    openAllUartConsolesCommandHandler.bind(undefined, pluginCtx),
  );
  subscriptions.push(allUartsCommand);

  const logsCommand = vscode.commands.registerCommand(
    'renode.openLogs',
    openLogsConsoleCommandHandler.bind({ logsPort: INITIAL_PORT }, pluginCtx),
  );
  subscriptions.push(logsCommand);

  const monitorCommand = vscode.commands.registerCommand(
    'renode.openMonitor',
    () => openMonitorCommandHandler(INITIAL_PORT - 1, pluginCtx),
  );
  subscriptions.push(monitorCommand);
}

async function openMonitorCommandHandler(
  monitorPort: number,
  pluginCtx: RenodePluginContext,
) {
  if (!renodeRunning(pluginCtx)) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  const term = createRenodeWebSocketTerminal(
    'Renode Monitor',
    `${pluginCtx.sessionBase}/telnet/${monitorPort}`,
  );
  term.show(false);
  pluginCtx.onPreDisconnect(() => {
    term.dispose();
  });
}

async function openAllUartConsolesCommandHandler(
  pluginCtx: RenodePluginContext,
) {
  if (!renodeRunning(pluginCtx)) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  const machines = await pluginCtx.getMachines();
  await Promise.all(
    machines.flatMap(async machine => {
      const uarts = await pluginCtx.getUarts(machine);
      return uarts.map(uart => pluginCtx.createUARTTerminal(machine, uart));
    }),
  );
}

async function openUartConsoleCommandHandler(pluginCtx: RenodePluginContext) {
  if (!renodeRunning(pluginCtx)) {
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

  await pluginCtx.createUARTTerminal(machineName, uartName);
}

function openLogsConsoleCommandHandler(
  this: { logsPort: number },
  pluginCtx: RenodePluginContext,
) {
  if (!renodeRunning(pluginCtx)) {
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

function renodeRunning(pluginCtx: RenodePluginContext): boolean {
  return pluginCtx.socketReady && pluginCtx.isDebugging;
}
