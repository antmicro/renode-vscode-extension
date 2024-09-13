// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

// This is the entrypoint for the extension's integration tests.
// It will be sourced and executed in the browser where vscode-web is running
// after renode-extension is installed.
require('mocha/mocha');

export function run(): Promise<void> {
  return new Promise((resolve, reject) => {
    mocha.setup({
      ui: 'tdd',
      reporter: undefined,
    });

    // ALL E2E TESTS NEED TO BE LISTED HERE
    require('./filesystem.test');

    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
