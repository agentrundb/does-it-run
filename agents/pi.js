import { spawnSync } from 'node:child_process';
import { buildSanitizedEnv } from '../lib/env.js';

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
    const modelId =
      model === 'deepseek' || model === 'deepseek-v4-pro'
        ? 'deepseek/deepseek-v4-pro'
        : model === 'deepseek-v4-flash'
        ? 'deepseek/deepseek-v4-flash'
        : model;
    return {
      PI_MODEL: modelId,
      DEEPSEEK_API_KEY: apiKey,
      OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
      OPENAI_API_KEY: apiKey,
    };
  },

  invoke({ workdir, task, env, timeoutMs }) {
    const safeEnv = buildSanitizedEnv(env);
    const result = spawnSync('pi', ['run', task, '--auto'], {
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

  parseUsage(rawStdout) {
    return {
      cost: null,
      tokens: null,
      toolUses: null,
      resultText: rawStdout.slice(-500),
    };
  },
};
