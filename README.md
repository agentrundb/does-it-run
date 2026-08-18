# does-it-run

> **Does it actually run?**

`does-it-run` executes AI agents against standard test cases and emits
**reproducible evidence** — runs, durations, costs, diffs — the fact layer
behind every compatibility page on
[agentrundb.com](https://agentrundb.com).

> Website content is not written. It is **run**.

## What it does

1. Prepares an isolated fixture repo with a failing unit test
2. Invokes a coding agent (headless CLI) with a standard task
3. Verifies the outcome by running the test suite
4. Emits the AgentRunDB standard run JSON:

```json
{
  "sourceRunId": "claude-code-deepseek-read-repo-edit-run-test-1765432100123",
  "compatibility": {
    "agentSlug": "claude-code",
    "targetType": "model",
    "targetSlug": "deepseek"
  },
  "testCase": "read-repo-edit-run-test",
  "status": "passed",
  "duration": 72.4,
  "toolCall": true,
  "fileEdit": true,
  "tokens": 12450,
  "cost": 0.18,
  "errors": [],
  "evidence": ["log.txt"]
}
```

## Quick start (local)

```bash
# 1. Requires: node >= 22, git, and the agent CLI installed (e.g. claude)
claude --version

# 2. Dry run — no model calls, prints the plan
npm run verify:dry -- --agent claude-code

# 3. Real run against DeepSeek
DEEPSEEK_API_KEY=sk-... npm run verify -- --agent claude-code --model deepseek

# 4. Import into a local AgentRunDB site
#    (inside the site repo: pnpm agentrundb:import <output json>)
```

Reports are written to `data/<agent-slug>/<date>/<sourceRunId>/` with the raw
agent log (`log.txt`), the report (`report.json`) and the fixture diff.

## CI (GitHub Actions)

`.github/workflows/verify.yml` runs the matrix on schedule. Required repo
secrets:

| Secret | Purpose |
|---|---|
| `DEEPSEEK_API_KEY` / `KIMI_API_KEY` / `GLM_API_KEY` / `QWEN_API_KEY` | Model API key — resolved as `<MODEL>_API_KEY` (or generic `API_KEY`) |
| `IMPORT_URL` *(optional)* | Site ingestion endpoint, e.g. `https://agentrundb.com/api/runs/import` |
| `IMPORT_TOKEN` *(optional)* | Bearer token for the ingestion endpoint |

Without `IMPORT_URL` the workflow only uploads the run JSON as an artifact.

## Adding an agent adapter

Create `agents/<slug>.js` exporting:

```js
export default {
  slug: 'my-agent',
  async checkInstalled() { /* throw if the CLI is missing */ },
  buildEnv({ model, apiKey }) { /* return env overrides */ },
  async invoke({ workdir, task, timeoutMs }) { /* run the agent headless */ },
};
```

Then run `npm run verify -- --agent my-agent`.

## Test cases

Cases live in `cases/` as JSON. Each case defines the task prompt, the
expected outcome and the fixture it uses. Cases map 1:1 to `test_cases`
rows on the site — keep slugs in sync.

## License

MIT
