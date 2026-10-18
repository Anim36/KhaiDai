import { execSync } from 'node:child_process';
const procs = execSync('powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,StartTime | ConvertTo-Csv -NoTypeInformation"', { encoding: 'utf8' });
console.log('processes:', procs);
const listens = execSync('powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess | ConvertTo-Csv -NoTypeInformation"', { encoding: 'utf8' });
console.log('listens:', listens);
import { rmSync } from 'node:fs';
rmSync('D:\\KhaiDai\\khaidai\\scripts\\_state.mjs', { force: true });