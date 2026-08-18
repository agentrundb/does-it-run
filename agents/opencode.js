import { spawnSync } from 'node:child_process';

/**
 * OpenCode CLI adapter — runs headless via `opencode --prompt ... --auto`.
 */
export default {
  slug: 'opencode',

  async checkInstalled() {
    const probe = spawnSync('opencode', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      throw new Error('opencode CLI not found — install from https://opencode.ai');
    }
    return probe.stdout.trim();
  },

  version() {
    const probe = spawnSync('opencode', ['--version'], { encoding: 'utf8' });
    return probe.stdout.trim() || 'unknown';
  },

  /** Build environment overrides for the specified model. */
  buildEnv({ model, apiKey }) {
    if (model === 'deepseek') {
      return {
        DEEPSEEK_API_KEY: apiKey,
        OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
        OPENAI_API_KEY: apiKey,
      };
    }
    return {
      OPENAI_API_KEY: apiKey,
    };
  },

  /** Headless invocation. Returns { ok, stdout, stderr, timedOut, exitCode }. */
  invoke({ workdir, task, env, timeoutMs }) {
    const args = [
      '--prompt',
      task,
      '--auto',
      '--pure',
    ];

    const result = spawnSync('opencode', args, {
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

  /** Best-effort usage extraction from opencode output. */
  parseUsage(rawStdout) {
    let tokens = null;
    let cost = null;
    const tokenMatch = rawStdout.match(/tokens?:\s*(\d+)/i);
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
