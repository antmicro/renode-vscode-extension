const esbuild = require('esbuild');
const { polyfillNode } = require('esbuild-plugin-polyfill-node');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

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
  entryPoints,
  outfile,
  platform = 'node',
  extraPlugins = [],
) {
  return esbuild.context({
    entryPoints,
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
  });
}

async function main() {
  const ctxMain = await esbuildContext(
    ['src/extension.ts'],
    'dist/extension.js',
  );
  const ctxWeb = await esbuildContext(
    ['src/extension.ts'],
    'dist/web.js',
    'browser',
    [polyfillNode({})],
  );
  if (watch) {
    await Promise.all([ctxMain.watch(), ctxWeb.watch()]);
  } else {
    await Promise.all([ctxMain.rebuild(), ctxWeb.rebuild()]);
    await Promise.all([ctxMain.dispose(), ctxWeb.dispose()]);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
