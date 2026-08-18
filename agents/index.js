import claudeCode from './claude-code.js';
import cline from './cline.js';
import codex from './codex.js';
import deepseekHarness from './deepseek-harness.js';
import openclaw from './openclaw.js';
import opencode from './opencode.js';
import pi from './pi.js';
import qwenCode from './qwen-code.js';

export const adapters = {
  'claude-code': claudeCode,
  codex,
  opencode,
  cline,
  pi,
  openclaw,
  'qwen-code': qwenCode,
  'deepseek-harness': deepseekHarness,
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
