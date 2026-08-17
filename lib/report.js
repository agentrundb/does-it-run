import { randomUUID } from 'node:crypto';

/**
 * Build the AgentRunDB standard run JSON (product spec §18 / site contract:
 * src/modules/agentrundb/constants.ts verifierRunSchema — keep in sync).
 */
export function buildRun(input) {
  const {
    agentSlug,
    modelSlug,
    caseSlug,
    agentVersion,
    modelVersion,
    environment,
    status,
    durationMs,
    toolCall,
    fileEdit,
    tokens,
    cost,
    errors = [],
    evidence = [],
    output,
    startedAt = new Date(),
  } = input;

  return {
    sourceRunId: `${agentSlug}-${modelSlug}-${caseSlug}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    compatibility: {
      agentSlug,
      targetType: 'model',
      targetSlug: modelSlug,
    },
    testCase: caseSlug,
    agentVersion: agentVersion ?? null,
    targetVersion: modelVersion ?? null,
    model: modelVersion ?? modelSlug,
    environment: environment ?? {},
    startedAt: new Date(startedAt).toISOString(),
    status,
    duration: durationMs !== null && durationMs !== undefined
      ? Math.round(durationMs) / 1000
      : null,
    toolCall: toolCall ?? null,
    fileEdit: fileEdit ?? null,
    tokens: tokens ?? null,
    cost: cost ?? null,
    errors,
    evidence,
    output: output ?? null,
  };
}

/** Strip nulls — the site zod schema tolerates undefined, not null. */
export function compactRun(run) {
  return Object.fromEntries(
    Object.entries(run).filter(([, value]) => value !== null && value !== undefined)
  );
}
