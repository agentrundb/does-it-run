import { spawnSync } from 'node:child_process';
import { buildSanitizedEnv } from '../lib/env.js';

/**
 * Claude Code adapter — runs headless via `claude -p`.
 * DeepSeek wiring mirrors the verified working configuration on
 * agentrundb.com/compatibility/claude-code/deepseek.
 */
export default {
  slug: 'claude-code',

  async checkInstalled() {
    const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      throw new Error(
        'claude CLI not found — install from https://claude.com/claude-code'
      );
    }
    return probe.stdout.trim();
  },

  version() {
    const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' });
    return probe.stdout.trim().replace(/^Claude Code\s+/i, '') || 'unknown';
  },

  /**
   * Anthropic-compatible endpoints — baseUrls follow each vendor's
   * official Claude Code integration docs.
   */
  buildEnv({ model, apiKey }) {
    const ANTHROPIC_COMPATIBLE = {
      deepseek: { baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-pro' },
      'deepseek-v4-pro': { baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-pro' },
      'deepseek-v4-flash': { baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash' },
      minimax: { baseUrl: 'https://api.minimaxi.com/anthropic', model: 'MiniMax-M3' },
      kimi: { baseUrl: 'https://api.moonshot.cn/anthropic', model: 'kimi-k2' },
      glm: { baseUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-4.6' },
      qwen: {
        baseUrl: 'https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy',
        model: 'qwen3-max',
      },
    };
    const target = ANTHROPIC_COMPATIBLE[model];
    if (!target) {
      throw new Error(
        `claude-code adapter has no endpoint for "${model}" — supported: ${Object.keys(ANTHROPIC_COMPATIBLE).join(', ')}`
      );
    }
    return {
      ANTHROPIC_BASE_URL: target.baseUrl,
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_MODEL: target.model,
      ANTHROPIC_SMALL_FAST_MODEL: target.model === 'deepseek-v4-pro' ? 'deepseek-v4-flash' : target.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: target.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: target.model === 'deepseek-v4-pro' ? 'deepseek-v4-flash' : target.model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: target.model,
    };
  },

  /** Headless invocation with strict environment whitelisting. */
  invoke({ workdir, task, env, timeoutMs }) {
    const safeEnv = buildSanitizedEnv(env);
    const result = spawnSync(
      'claude',
      [
        '-p', task,
        '--max-turns', '12',
        '--output-format', 'json',
        '--dangerously-skip-permissions',
      ],
      { cwd: workdir, env: safeEnv, encoding: 'utf8', timeout: timeoutMs }
    );
    return {
      ok: result.status === 0,
      exitCode: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
    };
  },

  /** Best-effort extraction from the --output-format json envelope. */
  parseUsage(rawStdout) {
    try {
      const parsed = JSON.parse(rawStdout);
      return {
        cost: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
        tokens:
          parsed.usage && typeof parsed.usage.input_tokens === 'number'
            ? (parsed.usage.input_tokens ?? 0) +
              (parsed.usage.output_tokens ?? 0) +
              ((parsed.usage.cache_read_input_tokens ?? 0) +
                (parsed.usage.cache_creation_input_tokens ?? 0))
            : null,
        toolUses: Array.isArray(parsed.toolUses) ? parsed.toolUses.length : null,
        resultText: typeof parsed.result === 'string' ? parsed.result : null,
      };
    } catch {
      return { cost: null, tokens: null, toolUses: null, resultText: null };
    }
  },
};
