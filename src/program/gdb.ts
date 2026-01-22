// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import { DebugProtocol } from '@vscode/debugprotocol';
import { MI2DebugSession, RunCommand } from '../code-debug/mibase';
import { MI2 } from '../code-debug/backend/mi2/mi2';
import * as vscode from 'vscode';
import { createRenodeWebSocketTerminal } from '../console';
import { RenodePluginContext } from '../context';
import { URL } from 'url';
import path from 'path';
import { TerminatedEvent } from '@vscode/debugadapter';

function randomPort(): number {
  const min = 10_000;
  const max = 11_000;

  const d = max - min + 1;

  let r = Math.random() * d + min;
  return Math.floor(r);
}

interface PeripheralHint {
  machine?: string;
  name: string;
}

export interface LaunchRequestArguments
  extends DebugProtocol.LaunchRequestArguments {
  resc?: string;
  repl?: string;
  elf: string;
  cwd: string;
  gdb?: string;
  pathMappings?: object;
  terminals?: (string | PeripheralHint)[];
  extraMonitorCommands?: string[];
  cpuCluster?: string;
  // TODO: Work on autodetection
  remoteSession?: boolean;
}

export class RenodeGdbDebugSession extends MI2DebugSession {
  private output?: vscode.OutputChannel;
  private mappings: [string, string][] = [];
  private terminals: vscode.Terminal[] = [];
  private renodeStarted = false;
  private disposables: vscode.Disposable[] = [];
  private interruptedLaunch: boolean = false;

  constructor(
    private pluginCtx: RenodePluginContext,
    private session: vscode.DebugSession,
  ) {
    super(false, false);
    vscode.debug.onDidReceiveDebugSessionCustomEvent(
      this.processCustomEvents,
      this,
      this.disposables,
    );
  }

  private processCustomEvents(event: vscode.DebugSessionCustomEvent) {
    switch (event.event) {
      case 'renode-parent-terminates': // Used for terminating Renode debugger by parent debugger
        if (event.session.id === this.session.parentSession?.id) {
          this.terminateSession();
        }
        break;
      default: // Do nothing after receiving unknown event
        break;
    }
  }

  protected override initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments,
  ): void {
    response.body ??= {};
    response.body.supportsDisassembleRequest = true;
    response.body.supportsReadMemoryRequest = true;
    response.body.supportsGotoTargetsRequest = true;
    response.body.supportsHitConditionalBreakpoints = true;
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsConditionalBreakpoints = true;
    response.body.supportsFunctionBreakpoints = true;
    // response.body.supportsEvaluateForHovers = true;
    response.body.supportsSetVariable = true;
    // response.body.supportsStepBack = true;
    response.body.supportsLogPoints = true;
    // response.body.supportsInstructionBreakpoints = true;
    // response.body.supportsSteppingGranularity = true;
    this.sendResponse(response);
  }

  protected setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    args: DebugProtocol.SetVariableArguments,
  ): Promise<void> {
    // TODO: Fix setting registers
    return super.setVariableRequest(response, args);
  }

  private async launchRequestInner(args: LaunchRequestArguments) {
    if (this.pluginCtx.isDebugging) {
      throw new Error('Only one debugging session is supported');
    }

    vscode.window.showInformationMessage('Starting Renode');
    const isRemote = args.remoteSession ?? false;

    this.pluginCtx.isDebugging = true;

    let monitorCommands = args.extraMonitorCommands ?? [];

    // This is where connection to server happens if it wasn't established before
    await this.pluginCtx.startRenode().catch(() => {
      throw new Error('Renode did not start');
    });

    // Disconnect handling needs to be added after we ensured that connection is established
    this.pluginCtx.onPreDisconnect(
      this.terminateSession,
      this,
      this.disposables,
    );

    this.terminals = await Promise.all(
      this.handleTerminals(args.terminals ?? []),
    );

    if (args.resc) {
      let resc = args.resc;
      if (isRemote) {
        const resp = await this.pluginCtx.sendFileFromPath(args.resc);
        resc = resp.path;
      } else if (!path.isAbsolute(resc)) {
        resc = path.join(args.cwd, resc);
      }
      monitorCommands = [...monitorCommands, `i @${resc}`];
    }

    if (args.repl) {
      let repl = args.repl;
      if (isRemote) {
        const resp = await this.pluginCtx.sendFileFromPath(args.repl);
        repl = resp.path;
      }
    }

    let elf = args.elf;
    if (isRemote) {
      const resp = await this.pluginCtx.sendFileFromPath(args.elf);
      elf = resp.path;
    } else if (!path.isAbsolute(elf)) {
      elf = path.join(args.cwd, elf);
    }

    const gdbPort = randomPort();
    monitorCommands = [
      ...monitorCommands,
      `machine StartGdbServer ${gdbPort} True ${JSON.stringify(args.cpuCluster ?? 'all')}`,
    ];

    await this.pluginCtx.execMonitor(monitorCommands).catch(() => {
      throw new Error('Renode did not execute initial commands');
    });

    this.renodeStarted = true;
    vscode.window.showInformationMessage('Renode started');
    const gdbPath = 'gdb';
    this.mappings = Object.entries(args.pathMappings ?? {});
    this.miDebugger = new MI2(gdbPath, ['-q', '--interpreter=mi2'], [], null);
    this.initDebugger();
    this.setValuesFormattingMode('prettyPrinters');
    this.initialRunCommand = RunCommand.NONE;
    const wsUri = new URL(`/run/${args.gdb ?? ''}`, this.pluginCtx.sessionBase);

    await this.miDebugger
      .connectWs(args.cwd, elf, `:${gdbPort}`, wsUri.toString(), isRemote)
      .catch(err => {
        throw new Error(`Failed to load debugger: ${err}`);
      });
  }

  protected override async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchRequestArguments,
  ) {
    try {
      // If this value changed to true during the launch sequence it means the debugger got a request to terminate, which we should follow
      this.interruptedLaunch = false;
      await this.launchRequestInner(args);
      if (this.interruptedLaunch) {
        await this.disconnect(); // Run disconnect again to make sure we cleaned up everything
        throw Error('Launch interrupted');
      }
      this.sendResponse(response);
    } catch (e: any) {
      let err = e.message ?? e.toString();
      vscode.window.showErrorMessage(err);
      this.sendErrorResponse(response, 103, err);
      this.pluginCtx.isDebugging = false;
    }
  }

  protected override async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments,
  ): Promise<void> {
    this.interruptedLaunch = true;
    await this.disconnect();
    this.sendResponse(response);
  }

  protected override async disassembleRequest(
    response: DebugProtocol.DisassembleResponse,
    args: DebugProtocol.DisassembleArguments,
  ): Promise<void> {
    console.log('[AAA]', JSON.stringify(args));

    const instructions = await this.miDebugger!.disassemble(
      args.memoryReference,
    );

    for (let insn of instructions) {
      if (insn.location && insn.location.path) {
        insn.location.path = this.convertDebuggerPathToClient(
          insn.location.path,
        );
      }
    }

    response.body = {
      instructions,
    };

    this.sendResponse(response);
  }

  protected override readMemoryRequest(
    response: DebugProtocol.ReadMemoryResponse,
    args: DebugProtocol.ReadMemoryArguments,
  ): void {
    let base = parseInt(args.memoryReference) + (args.offset ?? 0);
    this.miDebugger?.examineMemory(base, args.count).then(
      data => {
        console.log('memory data', data);
        const buf = Buffer.from(data, 'hex');
        const b64 = buf.toString('base64');
        response.body ??= { address: base.toString() };
        response.body.data = b64;
        this.sendResponse(response);
      },
      err => {
        this.sendErrorResponse(response, 114, `Read memory error: ${err}`);
      },
    );
  }

  protected terminateSession() {
    this.interruptedLaunch = true;
    this.sendEvent(new TerminatedEvent());
  }

  protected override convertClientPathToDebugger(clientPath: string): string {
    let debuggerPath = clientPath;
    for (const [their, our] of this.mappings) {
      if (clientPath.startsWith(our)) {
        return their + clientPath.slice(our.length);
      }
    }
    return debuggerPath;
  }

  protected override convertDebuggerPathToClient(debuggerPath: string): string {
    let clientPath = debuggerPath;
    for (const [their, our] of this.mappings) {
      if (debuggerPath.startsWith(their)) {
        return our + debuggerPath.slice(their.length);
      }
    }
    return clientPath;
  }

  override sendResponse(response: DebugProtocol.Response): void {
    super.sendResponse(response);
  }

  private async handleUrlTerminal(
    terminal: string,
    id: number,
  ): Promise<vscode.Terminal> {
    const name = `Terminal ${id}`;
    const res = createRenodeWebSocketTerminal(name, terminal);
    res.show(false);
    return res;
  }

  private async handleNamedUartTerminal(
    terminal: PeripheralHint,
  ): Promise<vscode.Terminal> {
    const machines = await this.pluginCtx.getMachines();
    if ('machine' in terminal && terminal.machine) {
      if (machines.find(m => m === terminal.machine) === undefined) {
        throw new Error(`machine '${terminal.machine} does not exist`);
      }
    } else {
      if (machines.length !== 1) {
        throw new Error(`multiple machine options for UART '${terminal.name}'`);
      }
      terminal.machine = machines[0];
    }

    const uarts = await this.pluginCtx.getUarts(terminal.machine);
    if (uarts.find(u => u === terminal.name) === undefined) {
      throw new Error(
        `UART '${terminal.name}' is not a part of machine '${terminal.machine}'`,
      );
    }

    return this.pluginCtx.createUARTTerminal(terminal.machine, terminal.name);
  }

  private handleTerminals(
    terminals: (string | PeripheralHint)[],
  ): Promise<vscode.Terminal>[] {
    let i = 0;
    return terminals.map(terminal => {
      if (typeof terminal === 'string') {
        return this.handleUrlTerminal(terminal, i++);
      } else {
        return this.handleNamedUartTerminal(terminal);
      }
    });
  }

  private async disconnect(): Promise<void> {
    for (const terminal of this.terminals) {
      terminal.dispose();
    }
    this.output?.dispose();

    if (this.renodeStarted) {
      vscode.window.showInformationMessage('Stopping Renode');
      await this.pluginCtx
        .stopRenode()
        .then(() => {
          vscode.window.showInformationMessage('Renode stopped');
        })
        .catch(() => {
          vscode.window.showErrorMessage('Renode did not stop');
        });
    }

    this.miDebugger?.detach();

    this.renodeStarted = false;
    this.pluginCtx.isDebugging = false;
  }

  public dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
