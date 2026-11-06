const { spawnSync } = require('node:child_process');
const path = require('node:path');
const isWindows = process.platform === 'win32';
const binary = path.resolve(__dirname, '..', 'node_modules', '.bin', isWindows ? 'prisma.cmd' : 'prisma');
const env = { ...process.env };
if (env.MIGRATION_DATABASE_URL) env.DATABASE_URL = env.MIGRATION_DATABASE_URL;
const result = spawnSync(binary, process.argv.slice(2), { cwd: process.cwd(), env, stdio: 'inherit', shell: isWindows });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
