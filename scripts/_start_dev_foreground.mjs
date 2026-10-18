import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
// Kill any existing node processes
try { execSync('powershell -NoProfile -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' }); } catch {}
console.log('killed existing node processes');
const p = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', '3000'], {
  cwd: 'D:\\KhaiDai\\khaidai',
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});
p.on('error', (e) => console.error('err:', e));
p.on('exit', (c) => console.log('exit:', c));