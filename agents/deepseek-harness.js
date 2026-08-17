/**
 * DeepSeek Harness (dsh) adapter — PLANNED.
 *
 * dsh ships a Web UI (`npx @deepseek-ai/dsh web` → http://127.0.0.1:3080);
 * a stable headless invocation path is still being identified
 * (developer preview, breaking changes expected). Implement buildEnv +
 * invoke once a headless CLI/API is confirmed upstream.
 */
export default {
  slug: 'deepseek-harness',
  planned: true,
  note: 'dsh Web UI runs at 127.0.0.1:3080 via npx @deepseek-ai/dsh web — headless API under investigation',
  async checkInstalled() {
    throw new Error(
      'deepseek-harness adapter not implemented yet — dsh exposes a Web UI; headless path TBD'
    );
  },
};
