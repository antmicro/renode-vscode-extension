// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import WebSocket from 'isomorphic-ws';
import { Buffer } from 'buffer';
import { tryConnectWs, tryJsonParse } from '../utils';
import { parse as parsePath } from 'path';

class SocketClosedEvent extends Event {
  constructor() {
    super('close');
  }
}

export class RenodeHypervisorSession extends EventTarget {
  private pendingRequest?: PendingRequest;

  public static async tryConnect(wsUri: string) {
    const uri = new URL('/proxy', wsUri);
    const socket = await tryConnectWs(uri.toString());
    return new RenodeHypervisorSession(socket, wsUri);
  }

  private constructor(
    private sessionSocket: WebSocket,
    private sessionUri: string,
  ) {
    super();
    this.sessionSocket.addEventListener('message', ev =>
      this.onData(ev.data as string),
    );
    this.sessionSocket.addEventListener('error', () => this.onError());
    this.sessionSocket.addEventListener('close', () => this.onClose());
  }

  public get sessionBase(): string {
    return this.sessionUri;
  }

  public get socketReady() {
    let state = this.sessionSocket.readyState ?? WebSocket.CLOSED;
    return state === WebSocket.OPEN;
  }

  public startRenode(args: string[] = []): Promise<any> {
    return this.sendHypervisorRequest({
      action: 'spawn',
      payload: {
        name: 'renode',
        args,
      },
    });
  }

  public stopRenode(): Promise<any> {
    return this.sendHypervisorRequest({
      action: 'kill',
      payload: {
        name: 'renode',
      },
    });
  }

  public sendFile(path: string, contents: Uint8Array): Promise<any> {
    const parsed = parsePath(path);
    const buf = Buffer.from(contents);
    const enc = buf.toString('base64');
    return this.sendHypervisorRequest({
      action: 'fs/upld',
      payload: {
        args: [parsed.base],
        data: enc,
      },
    });
  }

  public async listFiles(): Promise<any[]> {
    return this.sendHypervisorRequest({
      action: 'fs/list',
    });
  }

  public statFile(path: string): Promise<any> {
    return this.sendHypervisorRequest({
      action: 'fs/upld',
      payload: {
        args: [path],
      },
    });
  }

  public dispose() {
    this.sessionSocket.close();
  }

  // *** Event handlers ***

  private onData(data: string) {
    this.pendingRequest?._onData(data);
    this.pendingRequest = undefined;
  }

  private onError() {
    this.pendingRequest?._onError('WebSocket error');
    this.pendingRequest = undefined;
  }

  private onClose() {
    this.pendingRequest?._onError('WebSocket closed');
    this.pendingRequest = undefined;

    this.dispatchEvent(new SocketClosedEvent());
  }

  // *** Utilities ***

  // Wait for current request to finish, so we can make another one.
  // Must be called before making any request.
  private async waitForCurrentRequest() {
    if (this.pendingRequest) {
      await this.pendingRequest.waitForFinish();
    }
  }

  private async sendHypervisorRequest(req: {
    action: string;
    payload?: { [key: string]: any };
  }): Promise<any> {
    const msg = {
      ...req,
      version: '0.0.1',
    };

    if (this.socketReady) {
      const res = await this.sendInner(JSON.stringify(msg));
      const obj: any = tryJsonParse(res);

      if (!obj?.status || obj.status !== 'success') {
        throw new Error(obj.error);
      }

      return obj.data;
    } else {
      throw new Error('Not connected');
    }
  }

  private sendInner(msg: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      await this.waitForCurrentRequest();

      if (this.sessionSocket) {
        this.pendingRequest = new PendingRequest((res, err) => {
          if (err) {
            return reject(err);
          }
          resolve(res);
        });
        this.sessionSocket.send(msg);
      } else {
        reject(new Error('Not connected'));
      }
    });
  }
}

type RequestCallback = (response: any, error?: any) => void;

class PendingRequest {
  private callbacks: RequestCallback[] = [];

  constructor(cb: RequestCallback) {
    this.callbacks.push(cb);
  }

  async waitForFinish() {
    return new Promise<void>(resolve => {
      this.callbacks.push(() => resolve());
    });
  }

  _onData(data: any) {
    for (const cb of this.callbacks) {
      cb(data);
    }
  }

  _onError(err: any) {
    for (const cb of this.callbacks) {
      cb(undefined, err);
    }
  }
}
