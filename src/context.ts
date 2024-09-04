// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { RenodeFsProvider } from './fs';
import { RenodeHypervisorSession } from './common/connection';

const DEFAULT_URI = 'ws://127.0.0.1:21234';

export class RenodePluginContext {
  // TODO: Remove once more than one debugging session is supported.
  public isDebugging = false;
  public onPreDisconnect: vscode.Event<RenodePluginContext>;

  private currentSession?: RenodeHypervisorSession;
  private status: vscode.StatusBarItem;
  private preDisconnectEmitter: vscode.EventEmitter<RenodePluginContext>;

  private advancedConnectCommand = 'renode.advancedSessionConnect';
  private connectCommand = 'renode.hypervisorConnect';
  private disconnectCommand = 'renode.hypervisorDisconnect';

  constructor(subscriptions: any[]) {
    this.preDisconnectEmitter = new vscode.EventEmitter<RenodePluginContext>();
    this.onPreDisconnect = this.preDisconnectEmitter.event;

    const connectCommand = vscode.commands.registerCommand(
      this.connectCommand,
      this.connectCommandHandler.bind(this),
    );
    const advancedConnectCommand = vscode.commands.registerCommand(
      this.advancedConnectCommand,
      this.advancedConnectCommandHandler.bind(this),
    );
    const disconnectCommand = vscode.commands.registerCommand(
      this.disconnectCommand,
      this.disconnectCommandHandler.bind(this),
    );

    this.status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    subscriptions.push(this.status);

    subscriptions.push(connectCommand);
    subscriptions.push(advancedConnectCommand);
    subscriptions.push(disconnectCommand);

    const fsRegistration = vscode.workspace.registerFileSystemProvider(
      'renodehyp',
      new RenodeFsProvider(this),
    );
    subscriptions.push(fsRegistration);

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

  async startRenode(args: string[] = []) {
    await this.connectGuard();

    await this.currentSession!.startRenode(args);

    this.isDebugging = true;
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

  async downloadFile(path: string): Promise<Uint8Array> {
    await this.connectGuard();

    return this.currentSession!.downloadFile(path);
  }

  async sendFileFromContent(path: string, content: Uint8Array): Promise<any> {
    await this.connectGuard();

    return this.currentSession!.sendFile(path, content);
  }

  async sendFileFromPath(path: string): Promise<any> {
    const uri = vscode.Uri.file(path);
    const data = await vscode.workspace.fs.readFile(uri);

    return this.sendFileFromContent(path, data);
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

  dispose() {
    this.currentSession?.dispose();
    this.status.dispose();
  }

  private updateStatus() {
    if (this.socketReady) {
      this.status.text = '$(pass-filled) Renode Hypervisor Connected';
      this.status.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground',
      );
      this.status.command = this.disconnectCommand;
    } else {
      this.status.text =
        '$(circle-large-outline) Renode Hypervisor Not Connected';
      this.status.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.background',
      );
      this.status.command = this.connectCommand;
    }
    this.status.show();
  }

  private get socketReady(): boolean {
    return this.currentSession?.socketReady ?? false;
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
    this.currentSession = await RenodeProxySession.tryConnect(wsUri);
    this.currentSession.addEventListener('close', () => this.onClose());

    this.updateStatus();
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
      throw new Error('Could not connect to Renode Hypervisor');
    }
  }
}
