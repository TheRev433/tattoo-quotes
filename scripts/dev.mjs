#!/usr/bin/env node
// Starts the API (node --watch + tsx) and the Angular dev server together, prefixing their output.
// Ctrl+C stops both. Ports: API 4410 (PORT), web 4400 (WEB_PORT).
// Works on Windows too: npm is started through the same Node binary (npm_execpath) instead of a shell.
import { spawn } from 'node:child_process';

const apiPort = process.env.PORT ?? '4410';
const webPort = process.env.WEB_PORT ?? '4400';
const env = { ...process.env, PORT: apiPort, NG_CLI_ANALYTICS: 'false' };

/** Returns [command, prefixArgs, options] that run npm portably. */
function npmCommand() {
  const npmCli = process.env.npm_execpath;
  if (npmCli && /npm-cli\.js$/.test(npmCli)) return [process.execPath, [npmCli], {}];
  if (process.platform === 'win32') return ['npm.cmd', [], { shell: true }];
  return ['npm', [], {}];
}

const [command, prefixArgs, extra] = npmCommand();

const procs = [
  { name: 'api', color: 36, args: ['run', 'dev', '-w', '@tattoo-quotes/api'] },
  {
    name: 'web',
    color: 35,
    args: ['run', 'dev', '-w', '@tattoo-quotes/web', '--', '--port', webPort],
  },
].map(({ name, color, args }) => {
  const child = spawn(command, [...prefixArgs, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], ...extra });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 1);
  });
  return child;
});

console.log(`
  Tattoo Quotes (dev)
  → App:  http://localhost:${webPort}/        (open this)
  → API:  http://127.0.0.1:${apiPort}/api/health
  First run? In another terminal: npm run seed
`);

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
