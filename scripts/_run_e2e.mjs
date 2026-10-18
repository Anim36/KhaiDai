// Run all _e2e_* scripts.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'D:\\KhaiDai\\khaidai\\scripts';
const PATTERN = /^_e2e_.+\.(mjs|js)$/;
const scripts = readdirSync(ROOT).filter(n => PATTERN.test(n)).sort();
console.log(`Found ${scripts.length} e2e scripts.`);
const results = [];
for (const name of scripts) {
  const p = join(ROOT, name);
  const start = Date.now();
  const child = spawn('node', [p], { cwd: 'D:\\KhaiDai\\khaidai', shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => stdout += d);
  child.stderr.on('data', d => stderr += d);
  const exitCode = await new Promise((resolve) => {
    const t = setTimeout(() => { child.kill(); resolve(-1); }, 90000);
    child.on('exit', (code) => { clearTimeout(t); resolve(code); });
  });
  const elapsed = Date.now() - start;
  const status = exitCode === 0 ? '✓' : (exitCode === -1 ? '⏱' : '✗');
  results.push({ name, status, exitCode, elapsed });
  console.log(`  ${status} ${name} (${elapsed}ms, exit=${exitCode})`);
  if (exitCode !== 0) {
    const lastLines = (stdout + stderr).split(/\r?\n/).filter(l => l.trim()).slice(-2).join(' | ');
    console.log(`     last: ${lastLines.slice(0, 200)}`);
  }
}
const passed = results.filter(r => r.status === '✓').length;
const failed = results.filter(r => r.status === '✗').length;
const timedOut = results.filter(r => r.status === '⏱').length;
console.log(`\nTotal: ${results.length}, Pass: ${passed}, Fail: ${failed}, Timeout: ${timedOut}`);
console.log(`Pass rate: ${(passed / results.length * 100).toFixed(1)}%`);