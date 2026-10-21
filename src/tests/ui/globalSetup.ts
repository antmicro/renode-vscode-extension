// Copyright (c) 2026 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const EXAMPLES = path.resolve(__dirname, '../../../examples');

const VSCODE_VERSION = '1.142.0';

export default async function globalSetup() {
  if (!process.env.RENODE_PATH) {
    throw new Error(
      'RENODE_PATH variable not set. Set it to the Renode binary.',
    );
  }
  process.env.VSCODE_PATH = await downloadAndUnzipVSCode(VSCODE_VERSION);
  if (!existsSync(path.join(EXAMPLES, 'uart_passthrough.elf'))) {
    execFileSync(path.join(EXAMPLES, 'fetch.sh'), { stdio: 'inherit' });
  }
}
