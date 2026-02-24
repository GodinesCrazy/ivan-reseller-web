#!/usr/bin/env node
/**
 * Release check - RC1 validation
 * Runs sequentially: type-check, build (backend), build (frontend), test-production-cycle,
 * test-evolution-cycle, test-platform-commission.
 * Exit 0 only if all succeed.
 * Note: test-* scripts require backend server running and env configured.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(cmd, args, cwd, label) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

// Lint y build primero (no requieren servidor). Tests al final (requieren backend en ejecución).
const steps = [
  { label: 'type-check (backend)', fn: () => run('npm', ['run', 'type-check'], path.join(root, 'backend'), 'type-check (backend)') },
  { label: 'build (backend)', fn: () => run('npm', ['run', 'build'], path.join(root, 'backend'), 'build backend') },
  { label: 'build (frontend)', fn: () => run('npm', ['run', 'build'], path.join(root, 'frontend'), 'build frontend') },
  { label: 'test-production-cycle', fn: () => run('npm', ['run', 'test-production-cycle'], path.join(root, 'backend'), 'test-production-cycle') },
  { label: 'test-evolution-cycle', fn: () => run('npm', ['run', 'test-evolution-cycle'], path.join(root, 'backend'), 'test-evolution-cycle') },
  { label: 'test-platform-commission', fn: () => run('npm', ['run', 'test-platform-commission'], path.join(root, 'backend'), 'test-platform-commission') },
];

async function main() {
  console.log('[release-check] RC1 validation started');
  for (const step of steps) {
    try {
      console.log(`[release-check] Running: ${step.label}`);
      await step.fn();
      console.log(`[release-check] OK: ${step.label}`);
    } catch (err) {
      console.error(`[release-check] FAILED: ${step.label}`, err.message);
      process.exit(1);
    }
  }
  console.log('[release-check] RC1 validation passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
