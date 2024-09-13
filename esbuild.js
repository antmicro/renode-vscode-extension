const esbuild = require('esbuild');
const { polyfillNode } = require('esbuild-plugin-polyfill-node');
const { glob } = require('glob');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const tests = process.argv.includes('--tests');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log('[watch] build finished');
    });
  },
};

function esbuildContext(
  entryPoint,
  outfile,
  platform = 'node',
  extraPlugins = [],
  extraArgs = {},
) {
  return esbuild.context({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform,
    outfile,
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [
      ...extraPlugins,
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
    ...extraArgs,
  });
}

async function prepareTestContexts(polyfillPlugin) {
  const e2e = await esbuildContext(
    'src/tests/e2e/index.ts',
    'out/tests/e2e/index.js',
    'browser',
    [polyfillPlugin],
  );
  const e2eRunner = await esbuildContext(
    'src/tests/e2e/runner.ts',
    'out/tests/e2e/runner.js',
    'node',
    [],
    { packages: 'external', external: [] },
  );

  return [e2e, e2eRunner];
}

async function main() {
  const polyfillPlugin = polyfillNode({});
  const ctxMain = await esbuildContext('src/extension.ts', 'dist/extension.js');
  const ctxWeb = await esbuildContext(
    'src/extension.ts',
    'dist/web.js',
    'browser',
    [polyfillPlugin],
  );

  /** @type {esbuild.BuildContext<esbuild.BuildOptions>[]} */
  const testCtxs = await (tests
    ? prepareTestContexts(polyfillPlugin)
    : Promise.resolve([]));

  const allCtxs = [ctxMain, ctxWeb, ...testCtxs];

  if (watch) {
    await Promise.all(allCtxs.map(ctx => ctx.watch()));
  } else {
    await Promise.all(allCtxs.map(ctx => ctx.rebuild()));
    await Promise.all(allCtxs.map(ctx => ctx.dispose()));
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
