// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import WebSocket from 'isomorphic-ws';
import { Buffer } from 'buffer';
import { tryConnectWs, tryJsonParse } from '../utils';

class SocketClosedEvent extends Event {
  constructor() {
    super('close');
  }
}

export class RenodeProxySession extends EventTarget {
  private requestQueue: RequestCallback[] = [];

  public static async tryConnect(wsUri: string, workspace: string) {
    const uri = new URL(`/proxy/${workspace}`, wsUri);
    const socket = await tryConnectWs(uri.toString());
    return new RenodeProxySession(socket, wsUri);
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

  public startRenode(cwd?: string): Promise<any> {
    return this.sendSessionRequest({
      action: 'spawn',
      payload: {
        name: 'renode',
        cwd,
      },
    });
  }

  public execMonitor(commands: string[]): Promise<any> {
    return this.sendSessionRequest({
      action: 'exec-monitor',
      payload: {
        commands,
      },
    });
  }

  public getUarts(machine: string): Promise<string[]> {
    return this.sendSessionRequest({
      action: 'exec-renode',
      payload: {
        command: 'uarts',
        args: { machine },
      },
    });
  }

  public getMachines(): Promise<string[]> {
    return this.sendSessionRequest({
      action: 'exec-renode',
      payload: {
        command: 'machines',
      },
    });
  }

  public stopRenode(): Promise<any> {
    return this.sendSessionRequest({
      action: 'kill',
      payload: {
        name: 'renode',
      },
    });
  }

  public async downloadZipToFs(zipUrl: string) {
    return this.sendSessionRequest({
      action: 'fs/zip',
      payload: {
        args: [zipUrl],
      },
    });
  }

  public async downloadFile(path: string): Promise<Uint8Array> {
    const encoded = await this.sendSessionRequest({
      action: 'fs/dwnl',
      payload: {
        args: [path],
      },
    });
    return Buffer.from(encoded, 'base64');
  }

  public createDirectory(path: string): Promise<void> {
    return this.sendSessionRequest({
      action: 'fs/mkdir',
      payload: {
        args: [path],
      },
    });
  }

  public sendFile(path: string, contents: Uint8Array): Promise<any> {
    const buf = Buffer.from(contents);
    const enc = buf.toString('base64');
    return this.sendSessionRequest({
      action: 'fs/upld',
      payload: {
        args: [path],
        data: enc,
      },
    });
  }

  public async listFiles(path: string): Promise<any[]> {
    return this.sendSessionRequest({
      action: 'fs/list',
      payload: {
        args: [path],
      },
    });
  }

  public statFile(path: string): Promise<any> {
    return this.sendSessionRequest({
      action: 'fs/stat',
      payload: {
        args: [path],
      },
    });
  }

  public removeFile(path: string): Promise<any> {
    return this.sendSessionRequest({
      action: 'fs/remove',
      payload: {
        args: [path],
      },
    });
  }

  public moveFile(from: string, to: string): Promise<any> {
    return this.sendSessionRequest({
      action: 'fs/move',
      payload: { args: [from, to] },
    });
  }

  public copyFile(from: string, to: string): Promise<any> {
    return this.sendSessionRequest({
      action: 'fs/copy',
      payload: { args: [from, to] },
    });
  }

  public dispose() {
    this.sessionSocket.close();
  }

  // *** Event handlers ***

  private onData(data: string) {
    this.requestQueue.shift()?.(data);
  }

  private onError() {
    this.requestQueue.shift()?.(undefined, new Error('WebSocket error'));
  }

  private onClose() {
    while (this.requestQueue.length) {
      this.requestQueue.shift()?.(undefined, new Error('WebSocket closed'));
    }

    this.dispatchEvent(new SocketClosedEvent());
  }

  // *** Utilities ***

  private async sendSessionRequest(req: {
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
      console.log('[DEBUG] sending message to session', msg);

      if (this.sessionSocket) {
        this.requestQueue.push((res, err) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
        this.sessionSocket.send(msg);
      } else {
        reject(new Error('Not connected'));
      }
    });
  }
}

type RequestCallback = (response: any, error?: any) => void;
