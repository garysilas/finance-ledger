"use client";

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type React from "react";
import { cn } from "@/components/utils";
import { Button } from "@/components/ui/button";

export const Sheet = (
  props: React.ComponentProps<typeof SheetPrimitive.Root>,
) => <SheetPrimitive.Root data-slot="sheet" {...props} />;

export const SheetTrigger = (
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>,
) => <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;

export const SheetClose = (
  props: React.ComponentProps<typeof SheetPrimitive.Close>,
) => <SheetPrimitive.Close data-slot="sheet-close" {...props} />;

export const SheetPortal = (
  props: React.ComponentProps<typeof SheetPrimitive.Portal>,
) => <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;

export const SheetOverlay = (
  props: React.ComponentProps<typeof SheetPrimitive.Overlay>,
) => {
  const { className, ...rest } = props;

  return (
    <SheetPrimitive.Overlay
      className={cn(
        "bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 duration-100 data-closed:animate-out data-open:animate-in",
        className,
      )}
      data-slot="sheet-overlay"
      {...rest}
    />
  );
};

interface SheetContentProps extends React.ComponentProps<
  typeof SheetPrimitive.Content
> {
  /**
   * Show close button at the top right corner
   *
   * @default true
   */
  showCloseButton?: boolean;
  /**
   * Edge of the screen where the sheet appears.
   *
   * @default "right"
   */
  side?: "top" | "right" | "bottom" | "left";
}

export const SheetContent = (props: SheetContentProps) => {
  const {
    className,
    children,
    side = "right",
    showCloseButton = true,
    ...rest
  } = props;

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        className={cn(
          "bg-popover text-popover-foreground fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-closed:fade-out-0 data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10 data-closed:animate-out data-open:animate-in",
          className,
        )}
        data-side={side}
        data-slot="sheet-content"
        {...rest}
      >
        {children}
        {showCloseButton ? (
          <SheetClose asChild>
            <Button
              className="absolute top-3 end-3 absolute!"
              size="icon-sm"
              variant="ghost"
            >
              <XIcon aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </SheetClose>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
};

interface SheetHeaderProps extends React.ComponentProps<"div"> {
  /**
   * The description of the sheet
   */
  description?: string;
  /**
   * The title of the sheet
   */
  title?: string;
}

export const SheetHeader = (props: SheetHeaderProps) => {
  const { className, title, description, children, ...rest } = props;

  return (
    <div
      className={cn("gap-0.5 p-4 flex flex-col", className)}
      data-slot="sheet-header"
      {...rest}
    >
      {title ? <SheetTitle>{title}</SheetTitle> : null}
      {description ? <SheetDescription>{description}</SheetDescription> : null}
      {!title && typeof children === "string" ? (
        <SheetTitle>{children}</SheetTitle>
      ) : (
        children
      )}
    </div>
  );
};

export const SheetFooter = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn("gap-2 p-4 mt-auto flex flex-col", className)}
      data-slot="sheet-footer"
      {...rest}
    />
  );
};

export const SheetTitle = (
  props: React.ComponentProps<typeof SheetPrimitive.Title>,
) => {
  const { className, ...rest } = props;

  return (
    <SheetPrimitive.Title
      className={cn(
        "text-foreground text-base font-medium font-heading",
        className,
      )}
      data-slot="sheet-title"
      {...rest}
    />
  );
};

export const SheetDescription = (
  props: React.ComponentProps<typeof SheetPrimitive.Description>,
) => {
  const { className, ...rest } = props;

  return (
    <SheetPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="sheet-description"
      {...rest}
    />
  );
};
