export const FAILURE_CODES = [
  "INVALID_INPUT",
  "UNSUPPORTED_MONEY",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_TRANSITION",
  "CONFIG_INVALID",
  "KEY_UNAVAILABLE",
  "TOKEN_UNREADABLE",
  "DB_UNAVAILABLE",
  "DB_TIMEOUT",
  "COMMIT_UNKNOWN",
  "INTERNAL_FAILURE",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

const RETRYABLE: ReadonlySet<FailureCode> = new Set([
  "DB_UNAVAILABLE",
  "DB_TIMEOUT",
  "COMMIT_UNKNOWN",
]);

export type ServiceFailure = {
  ok: false;
  code: FailureCode;
  retryable: boolean;
  successorId?: string;
};

export type ServiceResult<T> = { ok: true; value: T } | ServiceFailure;

export function failure(
  code: FailureCode,
  extra?: { successorId?: string },
): ServiceFailure {
  return { ok: false, code, retryable: RETRYABLE.has(code), ...extra };
}

export function ok<T>(value: T): ServiceResult<T> {
  return { ok: true, value };
}
