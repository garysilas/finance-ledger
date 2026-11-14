"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type React from "react";
import { cn } from "@/components/utils";

export const TooltipProvider = (
  props: React.ComponentProps<typeof TooltipPrimitive.Provider>,
) => {
  const { delayDuration = 0, ...rest } = props;

  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...rest}
    />
  );
};

export const Tooltip = (
  props: React.ComponentProps<typeof TooltipPrimitive.Root>,
) => <TooltipPrimitive.Root data-slot="tooltip" {...props} />;

export const TooltipTrigger = (
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) => <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;

export const TooltipContent = (
  props: React.ComponentProps<typeof TooltipPrimitive.Content>,
) => {
  const { className, sideOffset = 4, children, ...rest } = props;

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs has-data-[slot=kbd]:pe-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[side=inline-start]:slide-in-from-end-2 data-[side=inline-end]:slide-in-from-start-2 z-50 w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) bg-foreground text-background",
          className,
        )}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...rest}
      >
        {children}
        <TooltipPrimitive.Arrow
          className="size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] data-[side=inline-end]:top-1/2! data-[side=inline-end]:-start-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-end-1 data-[side=inline-start]:-translate-y-1/2 z-50 bg-foreground fill-foreground"
          data-slot="tooltip-arrow"
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
};
