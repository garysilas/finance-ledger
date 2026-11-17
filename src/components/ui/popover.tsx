"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type React from "react";
import { cn } from "@/components/utils";

export const Popover = (
  props: React.ComponentProps<typeof PopoverPrimitive.Root>,
) => <PopoverPrimitive.Root data-slot="popover" {...props} />;

export const PopoverTrigger = (
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) => <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;

export const PopoverAnchor = (
  props: React.ComponentProps<typeof PopoverPrimitive.Anchor>,
) => <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;

export const PopoverContent = (
  props: React.ComponentProps<typeof PopoverPrimitive.Content>,
) => {
  const { className, align = "center", sideOffset = 4, ...rest } = props;

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        className={cn(
          "bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 flex flex-col gap-2.5 rounded-lg p-2.5 text-sm shadow-md ring-1 duration-100 data-[side=inline-start]:slide-in-from-end-2 data-[side=inline-end]:slide-in-from-start-2 z-50 w-72 max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) outline-hidden",
          className,
        )}
        data-slot="popover-content"
        sideOffset={sideOffset}
        {...rest}
      />
    </PopoverPrimitive.Portal>
  );
};

export const PopoverHeader = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      data-slot="popover-header"
      {...rest}
    />
  );
};

export const PopoverTitle = (
  props: React.ComponentProps<typeof PopoverPrimitive.Title>,
) => {
  const { className, ...rest } = props;

  return (
    <PopoverPrimitive.Title
      className={cn("font-medium", className)}
      data-slot="popover-title"
      {...rest}
    />
  );
};

export const PopoverDescription = (
  props: React.ComponentProps<typeof PopoverPrimitive.Description>,
) => {
  const { className, ...rest } = props;

  return (
    <PopoverPrimitive.Description
      className={cn("text-muted-foreground", className)}
      data-slot="popover-description"
      {...rest}
    />
  );
};

export const PopoverClose = (
  props: React.ComponentProps<typeof PopoverPrimitive.Close>,
) => <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
