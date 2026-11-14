"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";
import type React from "react";
import { cn } from "@/components/utils";

export const Separator = (
  props: React.ComponentProps<typeof SeparatorPrimitive.Root>,
) => {
  const {
    className,
    orientation = "horizontal",
    decorative = true,
    ...rest
  } = props;

  return (
    <SeparatorPrimitive.Root
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        orientation === "horizontal" && "h-px w-full",
        orientation === "vertical" && "h-full w-px",
        className,
      )}
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      {...rest}
    />
  );
};
