import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
