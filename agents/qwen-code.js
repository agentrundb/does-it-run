import { spawnSync } from 'node:child_process';
import { buildSanitizedEnv } from '../lib/env.js';

/**
 * Qwen Code CLI adapter — Qwen coding agent CLI based on Gemini CLI.
 */
export default {
  slug: 'qwen-code',

  async checkInstalled() {
    const probe = spawnSync('qwen-code', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      throw new Error('qwen-code CLI not found — install from https://github.com/QwenLM/qwen-code');
    }
    return probe.stdout.trim();
  },

  version() {
    const probe = spawnSync('qwen-code', ['--version'], { encoding: 'utf8' });
    return probe.stdout.trim() || '0.x';
  },

  buildEnv({ model, apiKey }) {
    return {
      OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
      OPENAI_API_KEY: apiKey,
      DEEPSEEK_API_KEY: apiKey,
    };
  },

  invoke({ workdir, task, env, timeoutMs }) {
    const safeEnv = buildSanitizedEnv(env);
    const result = spawnSync('qwen-code', ['-p', task, '--auto-approve'], {
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
