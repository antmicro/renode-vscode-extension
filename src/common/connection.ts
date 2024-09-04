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
  private requestQueue: EmptyCallback[] = [];

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
      this.onData(ev.data.toString()),
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

  public async downloadFile(path: string): Promise<Uint8Array> {
    const encoded = await this.sendHypervisorRequest({
      action: 'fs/dwnl',
      payload: {
        args: [path],
      },
    });
    return Buffer.from(encoded, 'base64');
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

  public async listFiles(path: string): Promise<any[]> {
    return this.sendHypervisorRequest({
      action: 'fs/list',
      payload: {
        args: [path],
      },
    });
  }

  public statFile(path: string): Promise<any> {
    return this.sendHypervisorRequest({
      action: 'fs/stat',
      payload: {
        args: [path],
      },
    });
  }

  public removeFile(path: string): Promise<any> {
    return this.sendHypervisorRequest({
      action: 'fs/remove',
      payload: {
        args: [path],
      },
    });
  }

  public moveFile(from: string, to: string): Promise<any> {
    return this.sendHypervisorRequest({
      action: 'fs/move',
      payload: { args: [from, to] },
    });
  }

  public copyFile(from: string, to: string): Promise<any> {
    return this.sendHypervisorRequest({
      action: 'fs/copy',
      payload: { args: [from, to] },
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
      return new Promise<void>(resolve => {
        this.requestQueue.push(() => resolve());
      });
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
      console.log('[DEBUG] got answer from session', obj);

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
      console.log('[DEBUG] sending message to session', msg);

      if (this.sessionSocket) {
        this.pendingRequest = new PendingRequest(
          (res, err) => {
            if (err) {
              return reject(err);
            }
            resolve(res);
          },
          () => {
            const nextReq = this.requestQueue.shift();
            nextReq?.();
          },
        );
        this.sessionSocket.send(msg);
      } else {
        reject(new Error('Not connected'));
      }
    });
  }
}

type EmptyCallback = () => void;
type RequestCallback = (response: any, error?: any) => void;

class PendingRequest {
  constructor(
    private callback: RequestCallback,
    private endCallback?: EmptyCallback,
  ) {}

  _onData(data: any) {
    this.callback(data);
    this.endCallback?.();
  }

  _onError(err: any) {
    this.callback(undefined, err);
    this.endCallback?.();
  }
}
