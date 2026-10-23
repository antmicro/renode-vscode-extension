// Copyright (c) 2025 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { RenodePluginContext } from '../context';

export function registerConsoleCommands(
  subscriptions: any[],
  pluginCtx: RenodePluginContext,
) {
  pluginCtx.onUartOpened(args => {
    pluginCtx.createUARTTerminal(args.machineName, args.name).catch(e => {
      vscode.window.showErrorMessage(
        `Could not open UART ${args.name} (${args.machineName}): ${e}`,
      );
    });
  });

  const uartCommand = vscode.commands.registerCommand(
    'renode.openUartConsole',
    () => openUartConsoleCommandHandler(pluginCtx),
  );
  subscriptions.push(uartCommand);

  const allUartsCommand = vscode.commands.registerCommand(
    'renode.openAllUartConsoles',
    () => openAllUartConsolesCommandHandler(pluginCtx),
  );
  subscriptions.push(allUartsCommand);

  const logsCommand = vscode.commands.registerCommand('renode.openLogs', () =>
    openLogsConsoleCommandHandler(pluginCtx),
  );
  subscriptions.push(logsCommand);

  const monitorCommand = vscode.commands.registerCommand(
    'renode.openMonitor',
    () => openMonitorCommandHandler(pluginCtx),
  );
  subscriptions.push(monitorCommand);
}

async function openMonitorCommandHandler(pluginCtx: RenodePluginContext) {
  if (!renodeRunning(pluginCtx)) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  pluginCtx.createTerminal('Renode Monitor', '/monitor');
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

function openLogsConsoleCommandHandler(pluginCtx: RenodePluginContext) {
  if (!renodeRunning(pluginCtx)) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  pluginCtx.createTerminal('Renode Logs', '/logs', true);
}

function renodeRunning(pluginCtx: RenodePluginContext): boolean {
  return pluginCtx.socketReady;
}
