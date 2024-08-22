# Renode VSCode Extension

Copyright (c) 2024 [Antmicro](https://antmicro.com)

Renode Extensions for [Visual Studio Code](https://code.visualstudio.com/) and [Theia](https://theia-ide.org), allowing users to easily integrate with [Renode](https://renode.io), an open source simulation framework for embedded systems.

## Features

- Allows you to run your project in Renode and debug it in your editor.

- Provides web extension compatibility - lets you debug binaries even in a pure web editor (like vscode.dev).

## Requirements

You need to already have [Renode](https://github.com/renode/renode) and gdb, for architecture you're planning to debug, installed.

Additionally this extension requires [Renode hypervisor](https://github.com/antmicro/renode-hypervisor), which manages your debug session and allows for remote connection.

## Building and installation

To build the extension, use `pnpm`:

```
pnpm i && pnpm run v:pack
```

This will produce a `renode*.vsix` file you can install in your IDE.

You can install it in the `Extension` tab, with the `Install from VSIX` option.

![Install from VSIX](img/vsix.png)
