// Run all probe/e2e scripts sequentially and report pass/fail.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:\\KhaiDai\\khaidai\\scripts';
const PATTERN = /^(_?probe-|_?e2e-|probe-flow-e2e\.).+\.(mjs|js)$/;

const scripts = readdirSync(ROOT)
  .filter(n => PATTERN.test(n) && !n.startsWith('_smoke_'))
  .sort();

console.log(`Found ${scripts.length} probe/e2e scripts.`);
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
  const lastLines = (stdout + stderr).split(/\r?\n/).filter(l => l.trim()).slice(-3).join(' | ');
  const status = exitCode === 0 ? '✓' : (exitCode === -1 ? '⏱' : '✗');
  results.push({ name, status, exitCode, elapsed, lastLines });
  console.log(`  ${status} ${name} (${elapsed}ms, exit=${exitCode})`);
  if (exitCode !== 0) console.log(`     last: ${lastLines.slice(0, 200)}`);
}

const passed = results.filter(r => r.status === '✓').length;
const failed = results.filter(r => r.status === '✗').length;
const timedOut = results.filter(r => r.status === '⏱').length;
console.log(`\n========== SUMMARY ==========`);
console.log(`Total: ${results.length}`);
console.log(`Pass: ${passed}`);
console.log(`Fail: ${failed}`);
console.log(`Timeout: ${timedOut}`);

const passRate = (passed / results.length * 100).toFixed(1);
console.log(`Pass rate: ${passRate}%`);