# Tests

Both suites need a Renode matching the `renode-ws-api` version pinned in `package.json`:

```
RENODE_SHA=$(grep -o 'typescript+[0-9]*git[0-9a-f]*' package.json | sed 's/.*git//')
RENODE_VERSION=$(curl -fsSL "https://raw.githubusercontent.com/renode/renode/$RENODE_SHA/tools/version")
mkdir -p renode
curl -fL "https://builds.renode.io/sha/renode-$RENODE_VERSION+git$RENODE_SHA.linux-portable.tar.gz" | tar -xz --strip-components=1 -C renode
export RENODE_PATH=$PWD/renode/renode
```

## UI tests

Playwright drives a real VS Code with the extension loaded, and goes through the demo from `examples/`.

```
pnpm install
node esbuild.js
pnpm test:ui
```

- Needs `gdb-multiarch` in `PATH`, `git` and `curl` (`examples/fetch.sh` is run before the tests, unless the ELF is already there)
- VS Code is downloaded to `.vscode-test/`
- Each test starts its own Renode on the default port (21234)

Every test records a trace and the Renode log. To see what happened:

```
pnpm exec playwright show-report playwright-report
```

or for a single test:

```
pnpm exec playwright show-trace test-results/<test>/trace.zip
```

## Web e2e tests

Mocha tests running in VS Code for the Web (`src/tests/e2e`).

```
pnpm test
```

The runner starts Renode from `RENODE_PATH`, unless one is already running.
