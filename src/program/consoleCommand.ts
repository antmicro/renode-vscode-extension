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
    () => openUartConsoleCommandHandler(pluginCtx, false),
  );
  subscriptions.push(uartCommand);

  const uartUiCommand = vscode.commands.registerCommand(
    'renode.openUartUi',
    () => openUartConsoleCommandHandler(pluginCtx, true),
  );
  subscriptions.push(uartUiCommand);

  const allUartsCommand = vscode.commands.registerCommand(
    'renode.openAllUartConsoles',
    () => openAllUartConsolesCommandHandler(pluginCtx),
  );
  subscriptions.push(allUartsCommand);

  const logsCommand = vscode.commands.registerCommand('renode.openLogs', () =>
    openLogsConsoleCommandHandler(pluginCtx, false),
  );
  subscriptions.push(logsCommand);

  const logsUiCommand = vscode.commands.registerCommand(
    'renode.openLogsUi',
    () => openLogsConsoleCommandHandler(pluginCtx, true),
  );
  subscriptions.push(logsUiCommand);

  const monitorCommand = vscode.commands.registerCommand(
    'renode.openMonitor',
    () => openMonitorCommandHandler(pluginCtx, false),
  );
  subscriptions.push(monitorCommand);

  const monitorUiCommand = vscode.commands.registerCommand(
    'renode.openMonitorUi',
    () => openMonitorCommandHandler(pluginCtx, true),
  );
  subscriptions.push(monitorUiCommand);
}

async function openMonitorCommandHandler(
  pluginCtx: RenodePluginContext,
  asWebview: boolean,
) {
  if (!renodeRunning(pluginCtx)) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  if (asWebview) {
    await pluginCtx.createMonitorWebview();
  } else {
    pluginCtx.createTerminal('Renode Monitor', '/monitor');
  }
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

async function openUartConsoleCommandHandler(
  pluginCtx: RenodePluginContext,
  asWebview: boolean,
) {
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
      if (machineName === undefined) {
        vscode.window.showWarningMessage('Renode: No machine selected');
        return;
      }
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
      if (uartName === undefined) {
        vscode.window.showWarningMessage('Renode: No UART selected');
        return;
      }
      if (uartName === parentName) {
        machineName = undefined;
        uartName = undefined;
      }
    }
  }

  if (asWebview) {
    await pluginCtx.createUARTWebview(machineName, uartName);
  } else {
    await pluginCtx.createUARTTerminal(machineName, uartName);
  }
}

async function openLogsConsoleCommandHandler(
  pluginCtx: RenodePluginContext,
  asWebview: boolean,
) {
  if (!renodeRunning(pluginCtx)) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  if (asWebview) {
    await pluginCtx.createLogsWebview();
  } else {
    pluginCtx.createTerminal('Renode Logs', '/logs', true);
  }
}

function renodeRunning(pluginCtx: RenodePluginContext): boolean {
  return pluginCtx.socketReady;
}
