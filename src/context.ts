// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { RenodeFsProvider } from './fs';
import { RenodeHypervisorSession } from './common/connection';

export class RenodePluginContext {
  // TODO: Remove once more than one debugging session is supported.
  public isDebugging = false;

  private currentSession?: RenodeHypervisorSession;
  private status: vscode.StatusBarItem;

  private connectCommand = 'renode.hypervisorConnect';
  private disconnectCommand = 'renode.hypervisorDisconnect';

  constructor(subscriptions: any[]) {
    const connectCommand = vscode.commands.registerCommand(
      this.connectCommand,
      this.connectCommandHandler.bind(this),
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
    subscriptions.push(disconnectCommand);

    const fsRegistration = vscode.workspace.registerFileSystemProvider(
      'renodehyp',
      new RenodeFsProvider(this),
      {
        isReadonly: true,
      },
    );
    subscriptions.push(fsRegistration);

    this.updateStatus();
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

  async sendFile(path: string): Promise<any> {
    await this.connectGuard();

    const uri = vscode.Uri.file(path);
    const data = await vscode.workspace.fs.readFile(uri);
    return this.currentSession!.sendFile(path, data);
  }

  async listFiles(): Promise<any[]> {
    await this.connectGuard();

    return this.currentSession!.listFiles();
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
    this.currentSession?.dispose();
    this.currentSession = undefined;

    this.updateStatus();
  }

  private async connectCommandHandler() {
    const wsUri = await vscode.window.showInputBox({
      title: 'Session URI',
      value: 'ws://localhost:6000',
      prompt: 'Enter base URI, not the hypervisor subpath',
    });

    if (wsUri !== undefined) {
      this.disconnectCommandHandler();
      this.currentSession = await RenodeHypervisorSession.tryConnect(wsUri);
      this.currentSession.addEventListener('close', () => this.onClose());
    }

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
