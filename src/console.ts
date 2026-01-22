// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import WebSocket from 'isomorphic-ws';

export function createRenodeWebSocketTerminal(
  name: string,
  wsUri: string,
  readonly?: boolean,
): vscode.Terminal {
  return vscode.window.createTerminal({
    name,
    pty: new RenodeWebSocketPseudoTerminal(name, wsUri, readonly),
  });
}

class RenodeWebSocketPseudoTerminal implements vscode.Pseudoterminal {
  onDidChangeName?: vscode.Event<string> | undefined;
  onDidClose?: vscode.Event<number | void> | undefined;
  onDidOverrideDimensions?:
    | vscode.Event<vscode.TerminalDimensions | undefined>
    | undefined;
  onDidWrite: vscode.Event<string>;
  readonly name: string;
  address: string;

  constructor(name: string, address: string, readonly?: boolean) {
    this.isActive = false;
    this.readonly = readonly ?? false;
    this.name = name;
    this.address = address;

    this.changeNameEmitter = new vscode.EventEmitter<string>();
    this.closeEmitter = new vscode.EventEmitter<number | void>();
    this.overrideDimensionsEmitter =
      new vscode.EventEmitter<vscode.TerminalDimensions>();
    this.writeEmitter = new vscode.EventEmitter<string>();

    this.onDidChangeName = this.changeNameEmitter.event;
    this.onDidClose = this.closeEmitter.event;
    this.onDidOverrideDimensions = this.overrideDimensionsEmitter.event;
    this.onDidWrite = this.writeEmitter.event;
  }

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.address);

    this.ws.addEventListener('close', () => {
      this.isActive = false;
      this.changeNameEmitter.fire('connection lost');
      this.closeEmitter.fire();
    });

    this.ws.addEventListener('message', ev => {
      this.writeEmitter.fire(ev.data.toString());
    });

    return new Promise(resolve => {
      this.ws!.addEventListener('open', () => {
        this.isActive = true;
        this.changeNameEmitter.fire(this.name);
        resolve();
      });
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = undefined;
  }

  handleInput(data: string): void {
    if (this.readonly) {
      return;
    }

    this.ws?.send(data);
  }

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.changeNameEmitter.fire(
      this.isActive ? this.name : 'waiting for connection',
    );
    this.connect();
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {}

  private changeNameEmitter: vscode.EventEmitter<string>;
  private closeEmitter: vscode.EventEmitter<number | void>;
  private overrideDimensionsEmitter: vscode.EventEmitter<vscode.TerminalDimensions>;
  private writeEmitter: vscode.EventEmitter<string>;

  private isActive: boolean;
  private readonly: boolean;
  private ws?: WebSocket;
}
