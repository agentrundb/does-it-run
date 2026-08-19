/**
 * Secure environment isolation for verifier child processes.
 * Whitelists only safe system variables and explicitly injected model keys.
 * Never leaks IMPORT_TOKEN, unrelated secrets, or sensitive host env.
 */
export function buildSanitizedEnv(customEnv = {}) {
  const ALLOWED_SYSTEM_VARS = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'TEMP',
    'TMP',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'NODE_PATH',
    'NODE_ENV',
    'TERM',
    'COLORTERM',
    'CI',
  ];

  const safeEnv = {};
  for (const k of ALLOWED_SYSTEM_VARS) {
    if (process.env[k] !== undefined) {
      safeEnv[k] = process.env[k];
    }
  }

  return {
    ...safeEnv,
    ...customEnv,
  };
}
