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
  let currentPort = { lastPort: initialPort };
  const uartCommand = vscode.commands.registerCommand(
    'renode.openUartConsole',
    openUartConsoleCommandHandler.bind(currentPort, pluginCtx),
  );
  subscriptions.push(uartCommand);

  const allUartsCommand = vscode.commands.registerCommand(
    'renode.openAllUartConsoles',
    openAllUartConsolesCommandHandler.bind(currentPort, pluginCtx),
  );
  subscriptions.push(allUartsCommand);

  const logsCommand = vscode.commands.registerCommand(
    'renode.openLogs',
    openLogsConsoleCommandHandler.bind({ logsPort: initialPort }, pluginCtx),
  );
  subscriptions.push(logsCommand);
}

async function openAllUartConsolesCommandHandler(
  this: { lastPort: number },
  pluginCtx: RenodePluginContext,
) {
  if (!pluginCtx.socketReady) {
    vscode.window.showErrorMessage('Renode not connected!');
    return;
  }

  let mappings: [number, string, string][] = [];
  for (const machine of await pluginCtx.getMachines()) {
    const uarts = await pluginCtx.getUarts(machine);
    for (const uart of uarts) {
      this.lastPort += 1;
      const port = this.lastPort;
      const monitorCommands = [
        `mach set "${machine}"`,
        `emulation CreateServerSocketTerminal ${port} "sst-${port}"`,
        `sst-${port} AttachTo ${uart}`,
      ];
      await pluginCtx.execMonitor(monitorCommands);
      mappings.push([port, machine, uart]);
    }
  }

  const terminals = mappings.map(([port, machine, uart]) => {
    const term = createRenodeWebSocketTerminal(
      `${uart} (${machine})`,
      `${pluginCtx.sessionBase}/telnet/${port}`,
    );
    term.show(true);
    return term;
  });
  pluginCtx.onPreDisconnect(() => terminals.forEach(term => term.dispose()));
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
    `sst-${this.lastPort} AttachTo ${uartName}`,
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
