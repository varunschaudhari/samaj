// Runs Vitest from a normalised working directory.
//
// On Windows, starting Node in "c:\..." (lower-case drive letter, which some
// shells and tools produce) loads Vitest once from "c:\..." and again, for the
// test files, from "C:\...". The two copies don't share state and every test
// file fails with "Cannot read properties of undefined (reading 'config')".
// Normalising the drive letter before Vitest loads avoids the second copy.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const cwd = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const require = createRequire(join(cwd, 'package.json'));
const vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const result = spawnSync(process.execPath, [vitestBin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);
