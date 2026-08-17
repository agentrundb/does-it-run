import claudeCode from './claude-code.js';

/**
 * Adapter registry. Planned adapters are placeholders — implement
 * buildEnv/invoke to activate them (see README "Adding an agent adapter").
 */
const planned = (slug, note) => ({
  slug,
  planned: true,
  note,
  async checkInstalled() {
    throw new Error(`adapter "${slug}" not implemented yet — ${note}`);
  },
});

export const adapters = {
  'claude-code': claudeCode,
  codex: planned('codex', 'codex CLI: set model_providers.deepseek in ~/.codex/config.toml, run `codex exec`'),
  opencode: planned('opencode', 'opencode: configure provider in opencode.json, run `opencode run`'),
  cline: planned('cline', 'cline: VS Code extension — needs headless harness (vscode-test)'),
  openclaw: planned('openclaw', 'openclaw: configure provider, run CLI headless'),
  pi: planned('pi', 'pi: configure model, run CLI headless'),
  'qwen-code': planned('qwen-code', 'qwen-code: set GEMINI_API_BASE-compatible env, run headless'),
  'deepseek-tui': planned('deepseek-tui', 'deepseek-tui: run CLI headless'),
};

export function getAdapter(slug) {
  const adapter = adapters[slug];
  if (!adapter) {
    throw new Error(
      `unknown agent "${slug}" — available: ${Object.keys(adapters).join(', ')}`
    );
  }
  return adapter;
}
