"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, RotateCcwIcon } from "lucide-react";

import {
  CLASSIFICATIONS,
  classificationMatchesAmount,
  type Classification,
} from "@/features/finance/classification";
import {
  CLASSIFICATION_LABELS,
  type TransactionRow,
} from "@/features/finance/transaction-params";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/components/utils";
import { updateTransaction, type ActionCode } from "./actions";

export type PickerCategory = { id: string; label: string };

type Patch = {
  categoryId?: string | null;
  classification?: Classification | null;
};

type Notice =
  | { kind: "conflict" }
  | { kind: "gone" }
  | { kind: "failed"; code: ActionCode };

function noticeText(notice: Notice): string {
  switch (notice.kind) {
    case "conflict":
      return "This transaction changed before your edit saved. The latest values are shown; choose again to retry.";
    case "gone":
      return "This transaction was removed or replaced, so it can no longer be edited.";
    case "failed":
      return notice.code === "INVALID_INPUT"
        ? "That choice is not allowed for this transaction."
        : "The edit could not be saved. Try again.";
  }
}

// Inline editor for one live row: effective category from the active
// categories, effective classification with sign invalid choices
// disabled, and per field reset to the provider value.
export function TransactionEditor({
  row,
  categories,
  onSaved,
}: {
  row: TransactionRow;
  categories: PickerCategory[];
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<TransactionRow | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, startSave] = useTransition();
  const current = fresh ?? row;
  const amount = BigInt(current.amountUnits);
  const locked = saving || !current.editable;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFresh(null);
      setNotice(null);
    }
  }

  function save(patch: Patch) {
    startSave(async () => {
      const result = await updateTransaction({
        transactionId: current.id,
        expectedOwnerEditRevision: current.ownerEditRevision,
        ...patch,
        requestId: crypto.randomUUID(),
      });
      if (result.ok) {
        onOpenChange(false);
        onSaved(`Saved changes to ${current.description}.`);
        return;
      }
      if (result.code === "SESSION") {
        router.push("/signin");
        return;
      }
      if (result.code === "CONFLICT") {
        if (result.row) {
          setFresh(result.row);
        }
        setNotice(
          result.row && !result.row.editable
            ? { kind: "gone" }
            : { kind: "conflict" },
        );
        return;
      }
      setNotice({ kind: "failed", code: result.code });
    });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit category and classification for ${row.description}`}
        >
          <PencilIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" aria-busy={saving}>
        <PopoverHeader>
          <PopoverTitle>Edit transaction</PopoverTitle>
          <PopoverDescription className="truncate">
            {current.description}
          </PopoverDescription>
        </PopoverHeader>

        {notice !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {noticeText(notice)}
          </p>
        ) : null}

        <section aria-labelledby={`category-${row.id}`} className="grid gap-1">
          <div className="flex items-center justify-between gap-2">
            <h3 id={`category-${row.id}`} className="text-xs font-medium">
              Category
            </h3>
            <Button
              variant="ghost"
              size="sm"
              disabled={locked}
              onClick={() => save({ categoryId: null })}
            >
              <RotateCcwIcon aria-hidden="true" />
              Use provider category
            </Button>
          </div>
          <Command className="rounded-md border" label="Category">
            <CommandInput
              placeholder="Search categories"
              aria-label="Search categories"
              disabled={locked}
            />
            <CommandList className="max-h-48">
              <CommandEmpty>No category matches.</CommandEmpty>
              <CommandGroup>
                {categories.map((category) => {
                  const selected = category.id === current.categoryId;
                  return (
                    <CommandItem
                      key={category.id}
                      value={`${category.label} ${category.id}`}
                      disabled={locked}
                      data-checked={selected}
                      onSelect={() => save({ categoryId: category.id })}
                    >
                      {category.label}
                      {selected ? (
                        <span className="sr-only"> (current)</span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section
          aria-labelledby={`classification-${row.id}`}
          className="grid gap-1"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id={`classification-${row.id}`} className="text-xs font-medium">
              Classification
            </h3>
            <Button
              variant="ghost"
              size="sm"
              disabled={locked}
              onClick={() => save({ classification: null })}
            >
              <RotateCcwIcon aria-hidden="true" />
              Use provider classification
            </Button>
          </div>
          <div
            role="group"
            aria-labelledby={`classification-${row.id}`}
            className="grid grid-cols-2 gap-1"
          >
            {CLASSIFICATIONS.map((value) => {
              const fits = classificationMatchesAmount(value, amount);
              const selected = value === current.classification;
              return (
                <Button
                  key={value}
                  variant={selected ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={selected}
                  disabled={locked || !fits}
                  className={cn("justify-start", selected && "font-semibold")}
                  onClick={() => save({ classification: value })}
                >
                  {CLASSIFICATION_LABELS[value]}
                  {!fits ? (
                    <span className="sr-only"> (does not fit this amount)</span>
                  ) : null}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {amount < 0n
              ? "This is money coming in, so Spending is unavailable."
              : amount > 0n
                ? "This is money going out, so Refund and Income are unavailable."
                : "Every classification fits a zero amount."}
          </p>
        </section>
      </PopoverContent>
    </Popover>
  );
}
