#!/usr/bin/env node
/**
 * AgentRunDB verifier runner.
 *
 * Usage:
 *   node runner/run.js --agent claude-code [--model deepseek]
 *                       [--case read-repo-edit-run-test]
 *                       [--runs 1] [--timeout 600000] [--dry-run]
 *
 * Env:
 *   <MODEL>_API_KEY    model API key, e.g. DEEPSEEK_API_KEY / KIMI_API_KEY /
 *                      GLM_API_KEY / QWEN_API_KEY — or generic API_KEY
 *   IMPORT_URL         optional site ingestion endpoint
 *   IMPORT_TOKEN       optional bearer token for IMPORT_URL
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAdapter } from '../agents/index.js';
import { buildRun, compactRun } from '../lib/report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const options = {
  agent: flag('agent', 'claude-code'),
  model: flag('model', 'deepseek'),
  caseSlug: flag('case', 'read-repo-edit-run-test'),
  runs: Number(flag('runs', '1')),
  timeoutMs: Number(flag('timeout', '600000')),
  dryRun: args.includes('--dry-run'),
  mock: args.includes('--mock'),
};

// ── helpers ──────────────────────────────────────────────────────────────────
function snapshot(dir) {
  const hashes = {};
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else hashes[full] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  };
  walk(dir);
  return hashes;
}

function changedFiles(before, after) {
  const changed = [];
  for (const [file, hash] of Object.entries(after)) {
    if (before[file] !== hash) changed.push(file);
  }
  for (const file of Object.keys(before)) {
    if (!(file in after)) changed.push(`${file} (deleted)`);
  }
  return changed;
}

async function importRun(report, url, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(report),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const adapter = getAdapter(options.agent);
  const caseFile = join(ROOT, 'cases', `${options.caseSlug}.json`);
  const testCase = JSON.parse(readFileSync(caseFile, 'utf8'));

  console.log(`AgentRunDB verifier`);
  console.log(`  agent     : ${options.agent}${adapter.planned ? ' (planned — not implemented)' : ''}`);
  console.log(`  model     : ${options.model}`);
  console.log(`  case      : ${options.caseSlug}`);
  console.log(`  runs      : ${options.runs}`);
  console.log(`  mode      : ${options.dryRun ? 'DRY-RUN (no model calls)' : options.mock ? 'MOCK (fixture pipeline simulation)' : 'live'}`);

  if (options.dryRun) {
    console.log(`\n[dry-run] would:`);
    console.log(`  1. copy ${join(ROOT, testCase.fixture)} → temp dir`);
    console.log(`  2. invoke ${options.agent} headless with the task prompt`);
    console.log(`  3. verify via: ${testCase.verify.command}`);
    console.log(`  4. write report to data/${options.agent}/<date>/<sourceRunId>/`);
    console.log(`  5. ${process.env.IMPORT_URL ? `POST to ${process.env.IMPORT_URL}` : 'print report path (IMPORT_URL not set)'}`);
    return;
  }

  const agentVersion = adapter.version?.() ?? '1.0.0';
  if (!options.dryRun && !options.mock) await adapter.checkInstalled();

  const keyName = `${options.model.toUpperCase().replace(/-/g, '_')}_API_KEY`;
  const apiKey =
    process.env[keyName] || process.env.API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey && !options.mock)
    throw new Error(`${keyName} (or API_KEY) is required for live runs`);
  const env = options.mock ? {} : adapter.buildEnv({ model: options.model, apiKey });

  const outRoot = join(ROOT, 'data', options.agent);
  mkdirSync(outRoot, { recursive: true });
  const summary = { created: 0, imported: 0, statuses: [] };

  for (let attempt = 1; attempt <= options.runs; attempt++) {
    console.log(`\n── run ${attempt}/${options.runs} ──`);
    const workdir = join(tmpdir(), `arndb-${options.agent}-${Date.now()}`);
    cpSync(join(ROOT, testCase.fixture), workdir, { recursive: true });
    const before = snapshot(workdir);

    const startedAt = new Date();
    let invocation;
    if (options.mock) {
      const sumFile = join(workdir, 'sum.js');
      if (existsSync(sumFile)) {
        const src = readFileSync(sumFile, 'utf8');
        writeFileSync(
          sumFile,
          src.replace(
            /function subtract\(a, b\) \{\s*return a \+ b;\s*\}/,
            'function subtract(a, b) {\n  return a - b;\n}'
          )
        );
      }
      invocation = {
        ok: true,
        exitCode: 0,
        stdout: `[${options.agent}] Read repository files\n[${options.agent}] Inspected sum.js and sum.test.js\n[${options.agent}] Identified bug: subtract(a, b) incorrectly returned a + b\n[${options.agent}] Patched sum.js: return a - b\n[${options.agent}] Ran test suite: all 3 unit tests passed.`,
        stderr: '',
        timedOut: false,
      };
    } else {
      invocation = adapter.invoke({
        workdir,
        task: testCase.task,
        env,
        timeoutMs: options.timeoutMs,
      });
    }
    const durationMs = Date.now() - startedAt.getTime();

    // Verify: run the test suite in the patched repo.
    const verify = spawnSync('node', ['--test'], {
      cwd: workdir,
      encoding: 'utf8',
      timeout: 120000,
    });
    const after = snapshot(workdir);
    const edits = changedFiles(before, after);
    const fileEdit = edits.length > 0;
    const usage = adapter.parseUsage?.(invocation.stdout) ?? {};
    const toolCall = fileEdit || (usage.toolUses ?? 0) > 0;

    let status;
    const errors = [];
    if (invocation.timedOut) {
      status = 'error';
      errors.push('agent invocation timed out');
    } else if (!invocation.ok) {
      status = 'failed';
      errors.push(`agent exited with code ${invocation.exitCode}`);
    } else if (verify.status === 0) {
      status = 'passed';
    } else if (fileEdit) {
      status = 'partial';
      errors.push('agent finished but tests still fail');
    } else {
      status = 'failed';
      errors.push('agent finished without editing any file');
    }

    const report = compactRun(
      buildRun({
        agentSlug: options.agent,
        modelSlug: options.model,
        caseSlug: options.caseSlug,
        agentVersion,
        modelVersion: options.model === 'deepseek' ? 'deepseek-chat' : options.model,
        environment: { os: process.platform, node: process.version, verifier: 'does-it-run/0.1' },
        status,
        durationMs,
        toolCall,
        fileEdit,
        tokens: usage.tokens ?? null,
        cost: usage.cost ?? null,
        errors,
        evidence: ['log.txt', 'diff.txt'],
        output: usage.resultText?.slice(0, 500) ?? null,
        startedAt,
      })
    );

    // Persist evidence bundle.
    const runDir = join(outRoot, startedAt.toISOString().slice(0, 10), report.sourceRunId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'log.txt'), `${invocation.stdout}\n${invocation.stderr}`.trim() + '\n');
    writeFileSync(
      join(runDir, 'diff.txt'),
      edits.length ? edits.join('\n') : '(no file changes)\n'
    );
    writeFileSync(join(runDir, 'verify-output.txt'), verify.stdout + '\n' + verify.stderr);
    writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2));

    summary.created++;
    summary.statuses.push(status);
    console.log(`  status=${status} duration=${(durationMs / 1000).toFixed(1)}s edits=${edits.length} report=${runDir}/report.json`);

    if (process.env.IMPORT_URL && process.env.IMPORT_TOKEN) {
      const imported = await importRun(report, process.env.IMPORT_URL, process.env.IMPORT_TOKEN);
      if (imported.status === 200) summary.imported++;
      console.log(`  import → HTTP ${imported.status} ${JSON.stringify(imported.body?.data?.results?.[0]?.result ?? '')}`);
    }

    rmSync(workdir, { recursive: true, force: true });
  }

  console.log(`\nSummary: ${summary.created} runs (${summary.statuses.join(', ')}), ${summary.imported} imported.`);
}

main().catch((error) => {
  console.error(`\nverifier failed: ${error.message}`);
  process.exit(1);
});
