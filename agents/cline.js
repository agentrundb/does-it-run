import { spawnSync } from 'node:child_process';
import { buildSanitizedEnv } from '../lib/env.js';

/**
 * Cline Agent adapter — autonomous coding agent for VS Code / Headless test harness.
 */
export default {
  slug: 'cline',

  async checkInstalled() {
    const probe = spawnSync('cline', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      throw new Error('cline CLI/harness not found — install cline or run in vscode test harness');
    }
    return probe.stdout.trim();
  },

  version() {
    const probe = spawnSync('cline', ['--version'], { encoding: 'utf8' });
    return probe.stdout.trim() || '3.x';
  },

  buildEnv({ model, apiKey }) {
    const modelId =
      model === 'deepseek' || model === 'deepseek-v4-pro'
        ? 'deepseek-v4-pro'
        : model === 'deepseek-v4-flash'
        ? 'deepseek-v4-flash'
        : model;
    return {
      CLINE_MODEL: modelId,
      DEEPSEEK_API_KEY: apiKey,
      OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
      OPENAI_API_KEY: apiKey,
    };
  },

  invoke({ workdir, task, env, timeoutMs }) {
    const safeEnv = buildSanitizedEnv(env);
    const result = spawnSync('cline', ['--prompt', task, '--yes'], {
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
