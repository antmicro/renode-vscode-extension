// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import childprocess from 'child_process';
import { promisify } from 'util';
const spawn = promisify(childprocess.spawn);

const RENODE_URL = 'https://builds.renode.io/renode-latest.linux-portable-dotnet.tar.gz';
const RENODE_ARCHIVE = 'renode-portable.tar.gz';


export class RenodeSetup {
    readonly ctx: vscode.ExtensionContext;
    readonly renode_path : vscode.Uri;
    private renode_binary_path : vscode.Uri;
    private renode_archive_path : vscode.Uri;

    constructor(ctx: vscode.ExtensionContext) {
        this.ctx = ctx;
        this.renode_path = vscode.Uri.joinPath(ctx.globalStorageUri, '/renode');
        this.renode_binary_path = vscode.Uri.joinPath(this.renode_path, 'renode');
        this.renode_archive_path = vscode.Uri.joinPath(this.renode_path, RENODE_ARCHIVE);
    }

    // Returns the path to the renode binary, fetches it if it does not exists
    async getRenode(): Promise<string> {
        // Check if renode binary exists
        try {
            await fs.access(this.renode_binary_path.fsPath);
            return this.renode_binary_path.fsPath;
        } catch {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Renode not found, downloading",
            }, async (progress: vscode.Progress<any>, token: vscode.CancellationToken) => {
                await this.downloadFile(RENODE_URL, this.renode_archive_path.fsPath);
            });
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Extracting Renode",
            }, async (progress: vscode.Progress<any>, token: vscode.CancellationToken) => {
                spawn('tar', [
                    '-C',
                    this.renode_path.fsPath,
                    '--strip-components',
                    '1',
                    '-xf',
                    this.renode_archive_path.fsPath
                ], {});
            });
            return this.renode_archive_path.fsPath;
        }
    }

    async downloadFile(from: string, to: string) {
        const resp = await fetch(from);
        await fs.mkdir(path.dirname(to), { recursive: true });
        const out = await fs.open(to, 'w', 0o777);
        const outs = out.createWriteStream();
        await finished(Readable.fromWeb(resp.body! as any).pipe(outs));
    }
}