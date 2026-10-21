// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: '../../../test-results',
  globalSetup: './globalSetup.ts',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list', { printSteps: true }],
    ['html', { open: 'never', outputFolder: '../../../playwright-report' }],
  ],
});
