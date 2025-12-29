// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import assert from 'assert';
import vscode from 'vscode';
import { Buffer } from 'buffer';
import { RenodeProxySession } from 'renode-ws-api';

// NOTE: For now, the tests share a single workspace.
//       This means that when adding a new test you must
//       make sure none of the files and/or directories
//       overlap with any referenced by other tests.
suite('FileSystem Test Suite', function () {
  const workspaceFolder =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  assert.ok(workspaceFolder);
  const workspace = Date.now().toString(16);
  let testProxySession: RenodeProxySession;

  function getRenodePath(path: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: 'renodehyp',
      authority: '',
      path,
    });
  }

  async function touch(path: string) {
    await testProxySession.sendFile(path, Buffer.alloc(0));
  }

  suiteSetup(async function () {
    const cfg = vscode.workspace.getConfiguration('renode');
    await cfg.update('workspace', workspace);
    testProxySession = await RenodeProxySession.tryConnect(
      'ws://127.0.0.1:21234',
      workspace,
    );

    await vscode.commands.executeCommand('renode.mountFolder');
  });

  suiteTeardown(async function () {
    testProxySession.dispose();
  });

  test('Mounting', async function () {
    const folders = vscode.workspace.workspaceFolders ?? [];
    assert.ok(folders.length >= 2);

    const virtualFolder = folders.findIndex(
      folder => folder.uri.scheme === 'renodehyp',
    );
    assert.notStrictEqual(virtualFolder, -1);
  });

  test('Creating a file', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry => entry.name === 'foo.txt'),
      -1,
    );

    let edit = new vscode.WorkspaceEdit();
    edit.createFile(getRenodePath('/foo.txt'));
    await vscode.workspace.applyEdit(edit);

    const dirAfter = await testProxySession.listFiles('/');
    const idx = dirAfter.findIndex(entry => entry.name === 'foo.txt');
    assert.notStrictEqual(idx, -1);
    assert.ok(dirAfter[idx].isfile);
  });

  test('Creating a directory', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry => entry.name === 'foo'),
      -1,
    );

    await vscode.workspace.fs.createDirectory(getRenodePath('/foo'));

    const dirAfter = await testProxySession.listFiles('/');
    const idx = dirAfter.findIndex(entry => entry.name === 'foo');
    assert.notStrictEqual(idx, -1);
    assert.ok(!dirAfter[idx].isfile);
  });

  test('Creating a nested file', async function () {
    try {
      const dirBefore = await testProxySession.listFiles('/bar/baz');
      assert.strictEqual(dirBefore.length, 0);
    } catch {
      // The call above will probably fail since the /bar directory shouldn't exist.
      // This is the expected outcome so we ignore the error.
    }

    await vscode.workspace.fs.createDirectory(getRenodePath('/bar/baz'));

    const content = Buffer.from('Hello world');
    await vscode.workspace.fs.writeFile(
      getRenodePath('/bar/baz/hello.txt'),
      content,
    );

    const remoteContent = await testProxySession
      .downloadFile('/bar/baz/hello.txt')
      .then(Buffer.from);
    assert.deepStrictEqual(remoteContent, content);
  });

  test('Moving a file', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry =>
        ['foo1.txt', 'foo2.txt'].includes(entry.name),
      ),
      -1,
    );

    await touch('/foo1.txt');
    const dirAfter1 = await testProxySession.listFiles('/');
    assert.notStrictEqual(
      dirAfter1.findIndex(entry => entry.name === 'foo1.txt'),
      -1,
    );
    assert.strictEqual(
      dirAfter1.findIndex(entry => entry.name === 'foo2.txt'),
      -1,
    );

    await vscode.workspace.fs.rename(
      getRenodePath('/foo1.txt'),
      getRenodePath('/foo2.txt'),
    );
    const dirAfter2 = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirAfter2.findIndex(entry => entry.name === 'foo1.txt'),
      -1,
    );
    assert.notStrictEqual(
      dirAfter2.findIndex(entry => entry.name === 'foo2.txt'),
      -1,
    );
  });

  test('Copying a file', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry =>
        ['bar1.txt', 'bar2.txt'].includes(entry.name),
      ),
      -1,
    );

    await touch('/bar1.txt');
    const dirAfter1 = await testProxySession.listFiles('/');
    assert.notStrictEqual(
      dirAfter1.findIndex(entry => entry.name === 'bar1.txt'),
      -1,
    );
    assert.strictEqual(
      dirAfter1.findIndex(entry => entry.name === 'bar2.txt'),
      -1,
    );

    await vscode.workspace.fs.copy(
      getRenodePath('/bar1.txt'),
      getRenodePath('/bar2.txt'),
    );
    const dirAfter2 = await testProxySession.listFiles('/');
    assert.notStrictEqual(
      dirAfter2.findIndex(entry => entry.name === 'bar1.txt'),
      -1,
    );
    assert.notStrictEqual(
      dirAfter2.findIndex(entry => entry.name === 'bar2.txt'),
      -1,
    );
  });

  test('Reading a file', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry => entry.name === 'example1.txt'),
      -1,
    );

    const remoteContent = Buffer.from(Math.random().toString(36).slice(2));
    await testProxySession.sendFile('/example1.txt', remoteContent);

    const content = await vscode.workspace.fs.readFile(
      getRenodePath('/example1.txt'),
    );
    assert.deepStrictEqual(Buffer.from(content), remoteContent);
  });

  test('Deleting a file', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry => entry.name === 'example2.txt'),
      -1,
    );

    await touch('/example2.txt');
    const dirAfter1 = await testProxySession.listFiles('/');
    assert.notStrictEqual(
      dirAfter1.findIndex(entry => entry.name === 'example2.txt'),
      -1,
    );

    await vscode.workspace.fs.delete(getRenodePath('/example2.txt'));
    const dirAfter2 = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirAfter2.findIndex(entry => entry.name === 'example2.txt'),
      -1,
    );
  });

  test('Deleting a nested directory', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry => entry.name === 'baz'),
      -1,
    );

    await vscode.workspace.fs.createDirectory(getRenodePath('/baz/1/2'));
    await Promise.all([
      touch('/baz/1.txt'),
      touch('/baz/1/2/3.txt'),
      touch('/baz/1/2.txt'),
    ]);

    const dirAfter1 = await testProxySession.listFiles('/');
    const dirIdx = dirAfter1.findIndex(entry => entry.name === 'baz');
    assert.notStrictEqual(dirIdx, -1);
    assert.ok(!dirAfter1[dirIdx].isfile);

    await vscode.workspace.fs.delete(getRenodePath('/baz'), {
      recursive: true,
    });
    const dirAfter2 = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirAfter2.findIndex(entry => entry.name === 'baz'),
      -1,
    );
  });

  test('Reading a directory', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry => entry.name === 'biz'),
      -1,
    );

    await testProxySession.createDirectory('/biz/a/b/c');
    await Promise.all([
      touch('/biz/a/b/1.txt'),
      touch('/biz/a/b/2.txt'),
      touch('/biz/a/b/3.txt'),
    ]);

    const list = await vscode.workspace.fs.readDirectory(
      getRenodePath('/biz/a/b'),
    );

    assert.strictEqual(list.length, 4);
    const dirIdx = list.findIndex(([name]) => name === 'c');
    assert.notStrictEqual(dirIdx, -1);
    assert.strictEqual(list[dirIdx][1], vscode.FileType.Directory);

    const onlyFiles = list.filter((_, i) => i !== dirIdx);
    onlyFiles.sort();
    assert.ok(onlyFiles.every(([_, type]) => type === vscode.FileType.File));
    assert.deepStrictEqual(
      onlyFiles.map(([name]) => name),
      ['1.txt', '2.txt', '3.txt'],
    );
  });

  test('Stat a file', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry => entry.name === 'example3.txt'),
      -1,
    );

    const contents = Buffer.from('example3 file to stat');
    await testProxySession.sendFile('/example3.txt', contents);

    const result = await vscode.workspace.fs.stat(
      getRenodePath('/example3.txt'),
    );
    assert.strictEqual(result.type, vscode.FileType.File);
    assert.strictEqual(result.size, contents.byteLength);
    assert.ok(result.ctime > 0);
  });

  test('Stat a directory', async function () {
    const dirBefore = await testProxySession.listFiles('/');
    assert.strictEqual(
      dirBefore.findIndex(entry => entry.name === 'example3'),
      -1,
    );

    await testProxySession.createDirectory('/example3/a/b');

    const result = await vscode.workspace.fs.stat(getRenodePath('/example3'));
    assert.strictEqual(result.type, vscode.FileType.Directory);
    assert.ok(result.ctime > 0);
  });
});
