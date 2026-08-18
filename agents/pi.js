import { spawnSync } from 'node:child_process';

/**
 * Pi CLI adapter — minimal coding agent CLI with pluggable models by badlogic.
 */
export default {
  slug: 'pi',

  async checkInstalled() {
    const probe = spawnSync('pi', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      throw new Error('pi CLI not found — install from https://github.com/badlogic/pi-mono');
    }
    return probe.stdout.trim();
  },

  version() {
    const probe = spawnSync('pi', ['--version'], { encoding: 'utf8' });
    return probe.stdout.trim() || '0.x';
  },

  buildEnv({ model, apiKey }) {
    return {
      PI_MODEL: model === 'deepseek' ? 'deepseek/deepseek-chat' : model,
      DEEPSEEK_API_KEY: apiKey,
      OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
      OPENAI_API_KEY: apiKey,
    };
  },

  invoke({ workdir, task, env, timeoutMs }) {
    const result = spawnSync('pi', ['run', task, '--auto'], {
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
