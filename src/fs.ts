// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import vscode from 'vscode';
import { RenodePluginContext } from './context';

export class RenodeFsProvider implements vscode.FileSystemProvider {
  private fileChangeEmitter: vscode.EventEmitter<vscode.FileChangeEvent[]>;

  onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

  constructor(private pluginCtx: RenodePluginContext) {
    this.fileChangeEmitter = new vscode.EventEmitter();
    this.onDidChangeFile = this.fileChangeEmitter.event;
  }

  watch(
    _uri: vscode.Uri,
    _options: {
      readonly recursive: boolean;
      readonly excludes: readonly string[];
    },
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    console.log('[!!!] got fs event: stat', arguments);
    if (uri.path === '/') {
      return {
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: 1,
        permissions: vscode.FilePermission.Readonly,
      };
    }

    try {
      const res = await this.pluginCtx.statFile(uri.path);
      return {
        ...res,
        type:
          (res.isfile ? vscode.FileType.File : vscode.FileType.Directory) |
          (res.islink ? vscode.FileType.SymbolicLink : 0),
        permissions: vscode.FilePermission.Readonly,
      };
    } catch {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    console.log('[!!!] got fs event: readDirectory', arguments);
    const files = await this.pluginCtx.listFiles();
    return files.map(file => [
      file.name,
      (file.isfile ? vscode.FileType.File : vscode.FileType.Directory) |
        (file.islink ? vscode.FileType.SymbolicLink : 0),
    ]);
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    console.log('[!!!] got fs event: createDirectory', arguments);
    throw new Error('Method not implemented.');
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    console.log('[!!!] got fs event: readFile', arguments);
    return this.pluginCtx.downloadFile(uri.path);
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { readonly create: boolean; readonly overwrite: boolean },
  ): Promise<void> {
    console.log('[!!!] got fs event: writeFile', arguments);
    return this.pluginCtx.sendFileFromContent(uri.path, content);
  }

  async delete(
    uri: vscode.Uri,
    options: { readonly recursive: boolean },
  ): Promise<void> {
    return this.pluginCtx.removeFile(uri.path);
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { readonly overwrite: boolean },
  ): Promise<void> {
    return this.pluginCtx.moveFile(oldUri.path, newUri.path);
  }

  async copy(
    source: vscode.Uri,
    destination: vscode.Uri,
    options: { readonly overwrite: boolean },
  ): Promise<void> {
    return this.pluginCtx.copyFile(source.path, destination.path);
  }
}
