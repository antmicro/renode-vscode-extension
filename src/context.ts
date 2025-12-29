// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { RenodeFsProvider } from './fs';
import {
  RenodeProxySession,
  Sensor,
  SensorType,
  SensorValue,
  UartOpenedArgs,
} from 'renode-ws-api';
import { createRenodeWebSocketTerminal } from './console';
import { delay } from './utils';

const DEFAULT_URI = 'ws://127.0.0.1:21234';

// NOTE: initial port is reserved for Renode logs, successive ports are used for UARTs
export const INITIAL_PORT = 29170;

export class RenodePluginContext {
  // TODO: Remove once more than one debugging session is supported.
  public isDebugging = false;
  public onPreDisconnect: vscode.Event<RenodePluginContext>;
  public onUartOpened: vscode.Event<UartOpenedArgs>;

  private currentSession?: RenodeProxySession;
  private status: vscode.StatusBarItem;
  private preDisconnectEmitter: vscode.EventEmitter<RenodePluginContext>;
  private uartOpenedEmitter: vscode.EventEmitter<UartOpenedArgs>;

  private advancedConnectCommand = 'renode.advancedSessionConnect';
  private connectCommand = 'renode.sessionConnect';
  private disconnectCommand = 'renode.sessionDisconnect';

  private disposables: vscode.Disposable[] = [];

  private lastPort: number = INITIAL_PORT;

  constructor() {
    this.preDisconnectEmitter = new vscode.EventEmitter<RenodePluginContext>();
    this.uartOpenedEmitter = new vscode.EventEmitter<UartOpenedArgs>();
    this.onPreDisconnect = this.preDisconnectEmitter.event;
    this.onUartOpened = this.uartOpenedEmitter.event;

    const connectCommand = vscode.commands.registerCommand(
      this.connectCommand,
      () => this.connectCommandHandler(),
    );
    const advancedConnectCommand = vscode.commands.registerCommand(
      this.advancedConnectCommand,
      () => this.advancedConnectCommandHandler(),
    );
    const disconnectCommand = vscode.commands.registerCommand(
      this.disconnectCommand,
      () => this.disconnectCommandHandler(),
    );

    this.status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.disposables.push(this.status);

    this.disposables.push(connectCommand);
    this.disposables.push(advancedConnectCommand);
    this.disposables.push(disconnectCommand);

    const fsRegistration = vscode.workspace.registerFileSystemProvider(
      'renodehyp',
      new RenodeFsProvider(this),
    );
    this.disposables.push(fsRegistration);

    this.updateStatus();
  }

  get defaultSessionBase(): string {
    const cfg = vscode.workspace.getConfiguration('renode');
    const uri = cfg.get<string>('defaultSessionUri');
    return uri ?? DEFAULT_URI;
  }

  get sessionBase(): string | undefined {
    return this.currentSession?.sessionBase;
  }

  get socketReady(): boolean {
    return this.currentSession?.socketReady ?? false;
  }

  async startRenode(cwd?: string) {
    await this.connectGuard();

    await this.currentSession!.startRenode(cwd);

    this.isDebugging = true;
  }

  async execMonitor(commands: string[]) {
    await this.connectGuard();

    await this.currentSession!.execMonitor(commands);
  }

  async getUarts(machine: string): Promise<string[]> {
    await this.connectGuard();

    return this.currentSession!.getUarts(machine);
  }

  async getMachines(): Promise<string[]> {
    await this.connectGuard();

    return this.currentSession!.getMachines();
  }

  async getSensors(machine: string): Promise<Sensor[]> {
    await this.connectGuard();

    return this.currentSession!.getSensors(machine);
  }

  async getSensorValue(sensor: Sensor, type: SensorType): Promise<SensorValue> {
    await this.connectGuard();

    return this.currentSession!.getSensorValue(sensor, type);
  }

  async setSensorValue(
    sensor: Sensor,
    type: SensorType,
    value: SensorValue,
  ): Promise<void> {
    await this.connectGuard();

    return this.currentSession!.setSensorValue(sensor, type, value);
  }

  async stopRenode() {
    // Stopping renode does not require a connection to a session.
    // If we're not connected that means we have lost the connection,
    // e.g. during debugging, so just return immediately.
    try {
      await this.currentSession?.stopRenode();
    } catch {}

    this.isDebugging = false;
  }

  async downloadZipToFs(zipUrl: string) {
    await this.connectGuard();

    this.currentSession!.fetchZipToFs(zipUrl);
  }

  async downloadFile(path: string): Promise<Uint8Array> {
    await this.connectGuard();

    return this.currentSession!.downloadFile(path);
  }

  async sendFileFromContent(path: string, content: Uint8Array): Promise<any> {
    await this.connectGuard();

    return this.currentSession!.sendFile(path, content);
  }

  async sendFileFromPath(path: string): Promise<any> {
    const uri = vscode.Uri.parse(path);
    const data = await vscode.workspace.fs.readFile(uri);

    return this.sendFileFromContent(uri.path, data);
  }

  async createDirectory(path: string): Promise<void> {
    await this.connectGuard();

    return this.currentSession!.createDirectory(path);
  }

  async removeFile(path: string): Promise<any> {
    await this.connectGuard();

    return this.currentSession!.removeFile(path);
  }

  async moveFile(from: string, to: string): Promise<any> {
    await this.connectGuard();

    return this.currentSession!.moveFile(from, to);
  }

  async copyFile(from: string, to: string): Promise<any> {
    await this.connectGuard();

    return this.currentSession!.copyFile(from, to);
  }

  async listFiles(path: string): Promise<any[]> {
    await this.connectGuard();

    return this.currentSession!.listFiles(path);
  }

  async statFile(path: string): Promise<any> {
    await this.connectGuard();

    return this.currentSession!.statFile(path);
  }

  createTerminal(
    name: string,
    port: number,
    readonly?: boolean,
  ): vscode.Terminal {
    const term = createRenodeWebSocketTerminal(
      name,
      `${this.sessionBase}/telnet/${port}`,
      readonly,
    );
    term.show(false);
    let disposable = this.onPreDisconnect(() => {
      term.dispose();
      disposable.dispose();
    });
    return term;
  }

  async createUARTTerminal(
    machine: string,
    uart: string,
  ): Promise<vscode.Terminal> {
    // TODO: add protocol support for ws endpoint creation with uart terminal
    this.lastPort += 1;
    let monitorCommands = [
      `mach set "${machine}"`,
      `emulation CreateServerSocketTerminal ${this.lastPort} "sst-${this.lastPort}"`,
      `sst-${this.lastPort} AttachTo ${uart}`,
    ];

    await this.execMonitor(monitorCommands);
    return this.createTerminal(`${uart} (${machine})`, this.lastPort);
  }

  dispose() {
    this.currentSession?.dispose();

    this.disposables.forEach(disposable => disposable.dispose());
  }

  private updateStatus() {
    if (this.socketReady) {
      this.status.text = '$(pass-filled) Renode Session Connected';
      this.status.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground',
      );
      this.status.command = this.disconnectCommand;
    } else {
      this.status.text = '$(circle-large-outline) Renode Session Not Connected';
      this.status.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.background',
      );
      this.status.command = this.connectCommand;
    }
    this.status.show();
  }

  // *** Command handlers ***

  private disconnectCommandHandler() {
    this.preDisconnectEmitter?.fire(this);
    this.currentSession?.dispose();
    this.currentSession = undefined;

    this.updateStatus();
  }

  private async advancedConnectCommandHandler() {
    let response = await vscode.window.showInputBox({
      title: 'Session URI',
      value: this.defaultSessionBase,
      prompt: 'Enter base URI, not the proxy subpath',
    });

    response = response?.trim();
    const wsUri =
      response === undefined || response === '' ? undefined : response;
    return this.connectCommandHandler(wsUri);
  }

  private async connectCommandHandler(wsUri: string = this.defaultSessionBase) {
    this.disconnectCommandHandler();
    const cfg = vscode.workspace.getConfiguration('renode');
    const workspace = cfg?.get<string>('workspace');

    const retryNumber = 5;
    const delayTime = 1000;

    // Connect with retry
    for (let i = 0; i < retryNumber; i++) {
      try {
        this.currentSession = await RenodeProxySession.tryConnect(
          // If connection fails, error will be caught and connecting will be retried again after delay
          wsUri,
          workspace ?? '',
        );
        break; // Will reach this break if connection succeeds
      } catch (e) {
        await delay(delayTime);
      }
    }

    this.currentSession?.addEventListener('close', () => this.onClose());
    this.updateStatus();
    this.currentSession?.registerUartOpenedCallback(args =>
      this.uartOpenedEmitter?.fire(args),
    );
  }

  // *** Event handlers ***

  private onClose() {
    this.currentSession = undefined;
    this.isDebugging = false;
    this.updateStatus();
  }

  // *** Utilities ***

  // Execute this function to guard the function from being executed without a session connection
  private async connectGuard() {
    if (!this.socketReady) {
      await this.connectCommandHandler();
    }

    if (!this.socketReady) {
      throw new Error('Could not connect to Renode Session');
    }
  }
}
