import { formatMoney, type MoneyContext } from "@/features/finance/format";
import { cn } from "@/components/utils";

// One money display everywhere: exact bigint minor units, a display context,
// and a spoken form for screen readers when a sign carries meaning.
export function Money({
  units,
  currency,
  context,
  className,
}: {
  units: bigint;
  currency: string;
  context: MoneyContext;
  className?: string;
}) {
  const result = formatMoney(units, currency, context);
  if (!result.ok) {
    return <span className={className}>Amount unavailable</span>;
  }

  return (
    <span className={cn("tabular-nums", className)}>
      {result.label ? <span className="sr-only">{result.srText}</span> : null}
      <span aria-hidden={result.label ? true : undefined}>{result.text}</span>
      {result.label ? (
        <span className="ml-1.5 rounded-md bg-status-near px-1.5 py-0.5 text-xs font-medium text-status-near-foreground">
          {result.label}
        </span>
      ) : null}
    </span>
  );
}
