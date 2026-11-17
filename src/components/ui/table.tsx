"use client";

import type React from "react";
import { cn } from "@/components/utils";

/**
 * The table, in a container that scrolls it sideways when it's wider. A
 * `tabIndex` is the container's (`0` lets a keyboard scroll it): focusable,
 * it's a region named as the table is (`aria-label`, `aria-labelledby`).
 * `dir` is set on both, so a right-to-left table that overflows starts
 * scrolled to its first column.
 */
export const Table = (props: React.ComponentProps<"table">) => {
  const { className, tabIndex, ...rest } = props;
  const region =
    tabIndex !== undefined && (rest["aria-label"] || rest["aria-labelledby"])
      ? {
          "aria-label": rest["aria-label"],
          "aria-labelledby": rest["aria-labelledby"],
          role: "region" as const,
        }
      : {};

  return (
    <div
      className="relative w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
      data-slot="table-container"
      dir={rest.dir}
      tabIndex={tabIndex}
      {...region}
    >
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        data-slot="table"
        {...rest}
      />
    </div>
  );
};

export const TableHeader = (props: React.ComponentProps<"thead">) => {
  const { className, ...rest } = props;

  return (
    <thead
      className={cn("[&_tr]:border-b", className)}
      data-slot="table-header"
      {...rest}
    />
  );
};

export const TableBody = (props: React.ComponentProps<"tbody">) => {
  const { className, ...rest } = props;

  return (
    <tbody
      className={cn("[&_tr:last-child]:border-0", className)}
      data-slot="table-body"
      {...rest}
    />
  );
};

export const TableFooter = (props: React.ComponentProps<"tfoot">) => {
  const { className, ...rest } = props;

  return (
    <tfoot
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className,
      )}
      data-slot="table-footer"
      {...rest}
    />
  );
};

export const TableRow = (props: React.ComponentProps<"tr">) => {
  const { className, ...rest } = props;

  return (
    <tr
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors has-aria-expanded:bg-muted/50",
        className,
      )}
      data-slot="table-row"
      {...rest}
    />
  );
};

export const TableHead = (props: React.ComponentProps<"th">) => {
  const { className, ...rest } = props;

  return (
    <th
      className={cn(
        "text-foreground h-10 px-2 text-start align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pe-0",
        className,
      )}
      data-slot="table-head"
      {...rest}
    />
  );
};

export const TableCell = (props: React.ComponentProps<"td">) => {
  const { className, ...rest } = props;

  return (
    <td
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pe-0",
        className,
      )}
      data-slot="table-cell"
      {...rest}
    />
  );
};

export const TableCaption = (props: React.ComponentProps<"caption">) => {
  const { className, ...rest } = props;

  return (
    <caption
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      data-slot="table-caption"
      {...rest}
    />
  );
};
