#!/usr/bin/env node
/**
 * AgentRunDB verifier runner.
 *
 * Usage:
 *   node runner/run.js --agent claude-code [--model deepseek]
 *                       [--case read-repo-edit-run-test]
 *                       [--runs 3] [--timeout 600000] [--dry-run]
 *
 * Env:
 *   <MODEL>_API_KEY    exact model API key (e.g. DEEPSEEK_API_KEY, MINIMAX_API_KEY)
 *   IMPORT_URL         optional site ingestion endpoint (/api/runs/import)
 *   IMPORT_TOKEN       bearer token for IMPORT_URL (kept isolated in parent process)
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
  runs: Number(flag('runs', '3')),
  timeoutMs: Number(flag('timeout', '600000')),
  dryRun: args.includes('--dry-run'),
  mock: args.includes('--mock'),
};

// ── helpers ──────────────────────────────────────────────────────────────────
function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function snapshot(dir) {
  const hashes = {};
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === '.git' || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else hashes[full] = sha256(readFileSync(full));
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

function resolveApiKey(model) {
  if (model.startsWith('deepseek')) {
    return process.env.DEEPSEEK_API_KEY;
  }
  const keyName = `${model.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
  return process.env[keyName];
}

async function importRun(report, url, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent':
        'does-it-run/0.2 (+https://github.com/agentrundb/does-it-run)',
      accept: 'application/json',
    },
    body: JSON.stringify(report),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const adapter = getAdapter(options.agent);
  const caseFile = join(ROOT, 'cases', `${options.caseSlug}.json`);
  if (!existsSync(caseFile)) {
    throw new Error(`Test case not found: ${options.caseSlug} (checked ${caseFile})`);
  }
  const testCase = JSON.parse(readFileSync(caseFile, 'utf8'));

  const resolvedModelVersion =
    options.model === 'deepseek'
      ? 'deepseek-v4-pro'
      : options.model;

  console.log(`AgentRunDB verifier`);
  console.log(`  agent     : ${options.agent}${adapter.planned ? ' (planned — not implemented)' : ''}`);
  console.log(`  model     : ${options.model} (version: ${resolvedModelVersion})`);
  console.log(`  case      : ${options.caseSlug}`);
  console.log(`  runs      : ${options.runs}`);
  console.log(`  mode      : ${options.dryRun ? 'DRY-RUN (no model calls)' : options.mock ? 'MOCK (fixture pipeline simulation)' : 'live'}`);

  if (options.dryRun) {
    console.log(`\n[dry-run] would:`);
    console.log(`  1. copy ${join(ROOT, testCase.fixture)} → temp dir`);
    console.log(`  2. git init + baseline commit`);
    console.log(`  3. invoke ${options.agent} headless with task prompt in isolated sandbox`);
    console.log(`  4. verify via: ${testCase.verify?.command || 'node --test'}`);
    console.log(`  5. capture unified git diff, logs, and SHA-256 evidence`);
    console.log(`  6. write report to data/${options.agent}/<date>/<sourceRunId>/`);
    console.log(`  7. ${process.env.IMPORT_URL ? `POST to ${process.env.IMPORT_URL}` : 'print report path (IMPORT_URL not set)'}`);
    return;
  }

  const agentVersion = adapter.version?.() ?? '1.0.0';
  if (!options.dryRun && !options.mock) await adapter.checkInstalled();

  const apiKey = resolveApiKey(options.model);
  if (!apiKey && !options.mock) {
    const keyName = options.model.startsWith('deepseek')
      ? 'DEEPSEEK_API_KEY'
      : `${options.model.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
    throw new Error(`${keyName} is required for live verification against ${options.model}`);
  }
  const env = options.mock ? {} : adapter.buildEnv({ model: options.model, apiKey });

  const outRoot = join(ROOT, 'data', options.agent);
  mkdirSync(outRoot, { recursive: true });
  const summary = { created: 0, imported: 0, statuses: [] };

  for (let attempt = 1; attempt <= options.runs; attempt++) {
    console.log(`\n── run ${attempt}/${options.runs} ──`);
    const workdir = join(tmpdir(), `arndb-${options.agent}-${Date.now()}`);
    cpSync(join(ROOT, testCase.fixture), workdir, { recursive: true });

    // Initialize temporary git repo for genuine unified diff generation
    spawnSync('git', ['init', '-q'], { cwd: workdir });
    spawnSync('git', ['config', 'user.name', 'AgentRunDB Verifier'], { cwd: workdir });
    spawnSync('git', ['config', 'user.email', 'verifier@agentrundb.com'], { cwd: workdir });
    spawnSync('git', ['add', '-A'], { cwd: workdir });
    spawnSync('git', ['commit', '-q', '-m', 'fixture: baseline'], { cwd: workdir });

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
        stdout: `[${options.agent}] Read repository files\n[${options.agent}] Inspected sum.js and sum.test.js\n[${options.agent}] Identified bug: subtract(a, b) incorrectly returned a + b\n[${options.agent}] Patched sum.js: return a - b\n[${options.agent}] Ran test suite: all unit tests passed.`,
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

    // Verify: execute the specific verification command declared in the test case.
    const verifyCommand = testCase.verify?.command || 'node --test';
    const verify = spawnSync(verifyCommand, {
      shell: true,
      cwd: workdir,
      encoding: 'utf8',
      timeout: 120000,
    });

    const diffProc = spawnSync('git', ['diff', 'HEAD'], { cwd: workdir, encoding: 'utf8' });
    const diffContent = diffProc.stdout || '(no file changes)\n';

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
      errors.push('agent finished but verification command still failed');
    } else {
      status = 'failed';
      errors.push('agent finished without modifying any file');
    }

    const logContent = `${invocation.stdout}\n${invocation.stderr}`.trim() + '\n';
    const verifyOutputContent = `${verify.stdout || ''}\n${verify.stderr || ''}`.trim() + '\n';

    const evidenceList = [
      { name: 'log.txt', sha256: sha256(logContent) },
      { name: 'diff.patch', sha256: sha256(diffContent) },
      { name: 'verify-output.txt', sha256: sha256(verifyOutputContent) },
    ];

    const report = compactRun(
      buildRun({
        agentSlug: options.agent,
        modelSlug: options.model,
        caseSlug: options.caseSlug,
        agentVersion,
        modelVersion: resolvedModelVersion,
        environment: {
          os: process.platform,
          node: process.version,
          verifier: 'does-it-run/0.2',
          sandbox: 'whitelisted-env',
        },
        status,
        durationMs,
        toolCall,
        fileEdit,
        tokens: usage.tokens ?? null,
        cost: usage.cost ?? null,
        errors,
        evidence: evidenceList.map((e) => e.name),
        output: usage.resultText?.slice(0, 500) ?? null,
        startedAt,
      })
    );

    // Persist evidence bundle with real unified diff and verification output.
    const runDir = join(outRoot, startedAt.toISOString().slice(0, 10), report.sourceRunId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'log.txt'), logContent);
    writeFileSync(join(runDir, 'diff.patch'), diffContent);
    writeFileSync(join(runDir, 'diff.txt'), edits.length ? edits.join('\n') : '(no file changes)\n');
    writeFileSync(join(runDir, 'verify-output.txt'), verifyOutputContent);
    writeFileSync(join(runDir, 'evidence-manifest.json'), JSON.stringify(evidenceList, null, 2));
    writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2));

    summary.created++;
    summary.statuses.push(status);
    console.log(`  status=${status} duration=${(durationMs / 1000).toFixed(1)}s edits=${edits.length} report=${runDir}/report.json`);

    if (process.env.IMPORT_URL && process.env.IMPORT_TOKEN) {
      const imported = await importRun(report, process.env.IMPORT_URL, process.env.IMPORT_TOKEN);
      const res = imported.body?.data?.results?.[0];
      if (imported.status === 200 && res?.result === 'created') summary.imported++;
      console.log(`  import → HTTP ${imported.status} ${res?.result ?? ''}${res?.error ? ` (${res.error})` : ''}`);
    }

    rmSync(workdir, { recursive: true, force: true });
  }

  console.log(`\nSummary: ${summary.created} runs (${summary.statuses.join(', ')}), ${summary.imported} imported.`);
}

main().catch((error) => {
  console.error(`\nverifier failed: ${error.message}`);
  process.exit(1);
});
