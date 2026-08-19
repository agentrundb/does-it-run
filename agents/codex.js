import { spawnSync } from 'node:child_process';
import { buildSanitizedEnv } from '../lib/env.js';

/**
 * Codex CLI adapter — runs headless via `codex exec`.
 */
export default {
  slug: 'codex',

  async checkInstalled() {
    const probe = spawnSync('codex', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      throw new Error('codex CLI not found — install from https://openai.com/codex');
    }
    return probe.stdout.trim();
  },

  version() {
    const probe = spawnSync('codex', ['--version'], { encoding: 'utf8' });
    return probe.stdout.trim().replace(/^codex-cli\s+/i, '') || 'unknown';
  },

  /** Build environment overrides for the specified model. */
  buildEnv({ model, apiKey }) {
    if (model === 'deepseek' || model === 'deepseek-v4-pro' || model === 'deepseek-v4-flash') {
      const modelId = model === 'deepseek-v4-flash' ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
      return {
        OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
        OPENAI_API_KEY: apiKey,
        DEEPSEEK_API_KEY: apiKey,
        CODEX_MODEL: modelId,
      };
    }
    return {
      OPENAI_API_KEY: apiKey,
    };
  },

  /** Headless invocation with strict environment whitelisting. */
  invoke({ workdir, task, env, timeoutMs }) {
    const args = [
      'exec',
      task,
      '--dangerously-bypass-approvals-and-sandbox',
    ];

    const safeEnv = buildSanitizedEnv(env);
    const result = spawnSync('codex', args, {
      cwd: workdir,
      env: safeEnv,
      encoding: 'utf8',
      timeout: timeoutMs,
    });

    return {
      ok: result.status === 0,
      exitCode: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
    };
  },

  /** Best-effort usage extraction from codex output. */
  parseUsage(rawStdout) {
    let tokens = null;
    let cost = null;
    const tokenMatch = rawStdout.match(/(\d+)\s+(?:total\s+)?tokens/i);
    if (tokenMatch) {
      tokens = parseInt(tokenMatch[1], 10);
    }
    return {
      cost,
      tokens,
      toolUses: null,
      resultText: rawStdout.slice(-500),
    };
  },
};
