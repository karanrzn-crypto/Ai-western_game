import { spawnSync } from 'node:child_process';

const compile = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js'], { stdio: 'inherit' });
if ((compile.status ?? 1) !== 0) process.exit(compile.status ?? 1);

const test = spawnSync(process.execPath, ['--test', 'dist/tests/*.test.js'], { stdio: 'inherit', shell: true });
process.exit(test.status ?? 1);
