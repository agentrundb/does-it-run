import { spawnSync } from 'node:child_process';

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
    if (model === 'deepseek') {
      return {
        OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
        OPENAI_API_KEY: apiKey,
        DEEPSEEK_API_KEY: apiKey,
      };
    }
    return {
      OPENAI_API_KEY: apiKey,
    };
  },

  /** Headless invocation. Returns { ok, stdout, stderr, timedOut, exitCode }. */
  invoke({ workdir, task, env, timeoutMs }) {
    const args = [
      'exec',
      task,
      '--dangerously-bypass-approvals-and-sandbox',
    ];

    const result = spawnSync('codex', args, {
      cwd: workdir,
      env: { ...process.env, ...env },
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
