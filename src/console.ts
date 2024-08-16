// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import WebSocket from 'isomorphic-ws';

export class RenodeWebSocketPseudoTerminal implements vscode.Pseudoterminal {
  onDidChangeName?: vscode.Event<string> | undefined;
  onDidClose?: vscode.Event<number | void> | undefined;
  onDidOverrideDimensions?:
    | vscode.Event<vscode.TerminalDimensions | undefined>
    | undefined;
  onDidWrite: vscode.Event<string>;
  name: string;

  constructor(name: string, address: string, readonly?: boolean) {
    this.isActive = false;
    this.readonly = readonly ?? false;
    this.name = name;

    this.changeNameEmitter = new vscode.EventEmitter<string>();
    this.closeEmitter = new vscode.EventEmitter<number | void>();
    this.overrideDimensionsEmitter =
      new vscode.EventEmitter<vscode.TerminalDimensions>();
    this.writeEmitter = new vscode.EventEmitter<string>();

    this.onDidChangeName = this.changeNameEmitter.event;
    this.onDidClose = this.closeEmitter.event;
    this.onDidOverrideDimensions = this.overrideDimensionsEmitter.event;
    this.onDidWrite = this.writeEmitter.event;

    this.ws = new WebSocket(address);

    this.ws.on('open', () => {
      this.isActive = true;
      this.changeNameEmitter.fire(this.name);
    });

    this.ws.on('close', (code, reason) => {
      this.isActive = false;
      this.changeNameEmitter.fire('connection lost');
      this.closeEmitter.fire();
    });

    this.ws.on('message', (data, isBinary) => {
      this.writeEmitter.fire(data.toString());
    });
  }

  close(): void {
    this.ws.close();
  }

  handleInput(data: string): void {
    if (this.readonly) {
      return;
    }

    this.ws.send(data);
  }

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.changeNameEmitter.fire(
      this.isActive ? this.name : 'waiting for connection',
    );
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {}

  private changeNameEmitter: vscode.EventEmitter<string>;
  private closeEmitter: vscode.EventEmitter<number | void>;
  private overrideDimensionsEmitter: vscode.EventEmitter<vscode.TerminalDimensions>;
  private writeEmitter: vscode.EventEmitter<string>;

  private isActive: boolean;
  private readonly: boolean;
  private ws: WebSocket;
}
