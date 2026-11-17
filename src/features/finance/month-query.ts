import "server-only";

import { monthEnd, monthStart, nextMonthStart, parseMonth } from "./dates";

// SQL fragments shared by the month summary and the transaction table so
// both always describe the same row set. Every fragment assumes the
// transaction table is aliased `t`; the candidate predicate binds the
// month bounds at $2 and $3.

export const EFFECTIVE_CLASSIFICATION_SQL = `COALESCE(t.owner_classification, t.provider_classification)`;

export const EFFECTIVE_DATE_SQL = `COALESCE(t.posted_date, t.provider_date)`;

// Rows that count toward the posted total (when posted) or the pending
// buckets (when pending).
export const COUNTING_SQL = `(t.removed_at IS NULL
  AND t.superseded_by_id IS NULL
  AND t.currency_code = 'USD'
  AND ${EFFECTIVE_CLASSIFICATION_SQL} IN ('spending', 'refund'))`;

// The one reason a row is left out of the month total, in precedence
// order; NULL for counting rows.
export const EXCLUSION_REASON_SQL = `CASE
  WHEN t.removed_at IS NOT NULL THEN 'removed'
  WHEN t.superseded_by_id IS NOT NULL THEN 'superseded'
  WHEN t.currency_code <> 'USD' THEN 'foreign_currency'
  WHEN ${EFFECTIVE_CLASSIFICATION_SQL} IN ('spending', 'refund') THEN NULL
  WHEN ${EFFECTIVE_CLASSIFICATION_SQL} = 'transfer' THEN 'transfer'
  WHEN ${EFFECTIVE_CLASSIFICATION_SQL} = 'card_payment' THEN 'card_payment'
  WHEN ${EFFECTIVE_CLASSIFICATION_SQL} = 'income' THEN 'income'
  WHEN t.amount_units < 0 THEN 'unclassified_inflow'
  ELSE 'unclassified_outflow'
END`;

export type MonthCandidate = {
  posted: string;
  pending: string;
  either: string;
  lower: string;
  upper: string;
};

// Monthly candidate predicate: posted rows join by posted_date, pending
// rows by provider_date. The final month of year 9999 uses an inclusive
// end date rather than an out-of-range next month.
export function monthCandidate(month: string): MonthCandidate | null {
  const bounds = parseMonth(month);
  if (!bounds) {
    return null;
  }
  const lower = monthStart(bounds.year, bounds.month);
  const next = nextMonthStart(bounds.year, bounds.month);
  const upper = next ?? monthEnd(bounds.year, bounds.month);
  const op = next === null ? "<=" : "<";
  const posted = `(t.posting_state = 'posted' AND t.posted_date >= $2 AND t.posted_date ${op} $3)`;
  const pending = `(t.posting_state = 'pending' AND t.provider_date >= $2 AND t.provider_date ${op} $3)`;
  return {
    posted,
    pending,
    either: `(${posted} OR ${pending})`,
    lower,
    upper,
  };
}
