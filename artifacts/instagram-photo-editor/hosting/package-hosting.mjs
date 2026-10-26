import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const hosting = dirname(fileURLToPath(import.meta.url));
const app = resolve(hosting, '..');
const output = resolve(app, '../../generated-artifacts/f18-portal-hosting');
const result = spawnSync('pnpm', ['run', 'build'], {
  cwd: app, stdio: 'inherit', env: { ...process.env, BASE_PATH: '/', PORT: '5173' },
});
if (result.status !== 0) process.exit(result.status || 1);
// Only this dedicated generated directory is replaced. Never touch hosting files.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(app, 'dist/public'), resolve(output, 'public_html'), { recursive: true });
await cp(resolve(hosting, 'config.example.php'), resolve(output, 'config.example.php'));
await cp(resolve(hosting, 'README.md'), resolve(output, 'INSTALACION.md'));
console.log(`Paquete preparado: ${output}\nNo incluye credenciales ni datos de sorteos.`);
