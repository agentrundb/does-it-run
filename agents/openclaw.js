import { spawnSync } from 'node:child_process';

/**
 * OpenClaw Agent adapter — open-source personal AI assistant framework.
 */
export default {
  slug: 'openclaw',

  async checkInstalled() {
    const probe = spawnSync('openclaw', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      throw new Error('openclaw CLI not found — install from https://github.com/openclaw/openclaw');
    }
    return probe.stdout.trim();
  },

  version() {
    const probe = spawnSync('openclaw', ['--version'], { encoding: 'utf8' });
    return probe.stdout.trim() || '0.x';
  },

  buildEnv({ model, apiKey }) {
    return {
      OPENCLAW_MODEL: model === 'deepseek' ? 'deepseek-chat' : model,
      DEEPSEEK_API_KEY: apiKey,
      OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
      OPENAI_API_KEY: apiKey,
    };
  },

  invoke({ workdir, task, env, timeoutMs }) {
    const result = spawnSync('openclaw', ['exec', task, '--headless'], {
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

  parseUsage(rawStdout) {
    return {
      cost: null,
      tokens: null,
      toolUses: null,
      resultText: rawStdout.slice(-500),
    };
  },
};
