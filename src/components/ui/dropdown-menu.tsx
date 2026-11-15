"use client";

import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import type React from "react";
import { cn } from "@/components/utils";

export const DropdownMenu = (
  props: React.ComponentProps<typeof MenuPrimitive.Root>,
) => <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;

export const DropdownMenuPortal = (
  props: React.ComponentProps<typeof MenuPrimitive.Portal>,
) => <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;

export const DropdownMenuTrigger = (
  props: React.ComponentProps<typeof MenuPrimitive.Trigger>,
) => <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;

export const DropdownMenuContent = (
  props: React.ComponentProps<typeof MenuPrimitive.Content>,
) => {
  const { className, align = "start", sideOffset = 4, ...rest } = props;

  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        className={cn(
          "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground min-w-32 rounded-lg p-1 shadow-md ring-1 duration-100 z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) max-w-[calc(100vw-2rem)] origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden data-[state=closed]:overflow-hidden",
          className,
        )}
        collisionPadding={8}
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        {...rest}
      />
    </MenuPrimitive.Portal>
  );
};

export const DropdownMenuGroup = (
  props: React.ComponentProps<typeof MenuPrimitive.Group>,
) => <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;

export const DropdownMenuItem = (
  props: React.ComponentProps<typeof MenuPrimitive.Item> & {
    /** Indents it to line up with items that have an icon or indicator. */
    inset?: boolean;
    variant?: "default" | "destructive";
  },
) => {
  const { className, inset, variant = "default", ...rest } = props;

  return (
    <MenuPrimitive.Item
      className={cn(
        "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:text-destructive not-data-[variant=destructive]:focus:**:text-accent-foreground not-data-[variant=destructive]:hover:**:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground gap-1.5 rounded-md px-1.5 py-1 text-sm data-inset:ps-7 [&_svg:not([class*='size-'])]:size-4 group/dropdown-menu-item relative flex cursor-default select-none items-center outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-inset={inset}
      data-slot="dropdown-menu-item"
      data-variant={variant}
      {...rest}
    />
  );
};

export const DropdownMenuCheckboxItem = (
  props: React.ComponentProps<typeof MenuPrimitive.CheckboxItem> & {
    /** Indents it to line up with items that have an icon or indicator. */
    inset?: boolean;
  },
) => {
  const { className, children, checked, inset, ...rest } = props;

  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground focus:**:text-accent-foreground gap-1.5 rounded-md py-1 pe-8 ps-1.5 text-sm data-inset:ps-7 [&_svg:not([class*='size-'])]:size-4 relative flex cursor-default select-none items-center outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-inset={inset}
      data-slot="dropdown-menu-checkbox-item"
      {...rest}
    >
      <span
        className="absolute end-2 flex items-center justify-center pointer-events-none"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.ItemIndicator>
          <CheckIcon aria-hidden="true" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
};

export const DropdownMenuRadioGroup = (
  props: React.ComponentProps<typeof MenuPrimitive.RadioGroup>,
) => (
  <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
);

export const DropdownMenuRadioItem = (
  props: React.ComponentProps<typeof MenuPrimitive.RadioItem> & {
    /** Indents it to line up with items that have an icon or indicator. */
    inset?: boolean;
  },
) => {
  const { className, children, inset, ...rest } = props;

  return (
    <MenuPrimitive.RadioItem
      className={cn(
        "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground focus:**:text-accent-foreground gap-1.5 rounded-md py-1 pe-8 ps-1.5 text-sm data-inset:ps-7 [&_svg:not([class*='size-'])]:size-4 relative flex cursor-default select-none items-center outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-inset={inset}
      data-slot="dropdown-menu-radio-item"
      {...rest}
    >
      <span
        className="absolute end-2 flex items-center justify-center pointer-events-none"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.ItemIndicator>
          <CheckIcon aria-hidden="true" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
};

export const DropdownMenuGroupLabel = (
  props: React.ComponentProps<typeof MenuPrimitive.Label> & {
    /** Indents it to line up with items that have an icon or indicator. */
    inset?: boolean;
  },
) => {
  const { className, inset, ...rest } = props;

  return (
    <MenuPrimitive.Label
      className={cn(
        "text-muted-foreground px-1.5 py-1 text-xs font-medium data-inset:ps-7",
        className,
      )}
      data-inset={inset}
      data-slot="dropdown-menu-group-label"
      {...rest}
    />
  );
};

export const DropdownMenuSeparator = (
  props: React.ComponentProps<typeof MenuPrimitive.Separator>,
) => {
  const { className, ...rest } = props;

  return (
    <MenuPrimitive.Separator
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      data-slot="dropdown-menu-separator"
      {...rest}
    />
  );
};

export const DropdownMenuShortcut = (props: React.ComponentProps<"span">) => {
  const { className, ...rest } = props;

  return (
    <span
      className={cn(
        "text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground group-hover/dropdown-menu-item:text-accent-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground ms-auto text-xs tracking-widest",
        className,
      )}
      data-slot="dropdown-menu-shortcut"
      {...rest}
    />
  );
};

export const DropdownMenuSub = (
  props: React.ComponentProps<typeof MenuPrimitive.Sub>,
) => <MenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;

export const DropdownMenuSubTrigger = (
  props: React.ComponentProps<typeof MenuPrimitive.SubTrigger> & {
    /** Indents it to line up with items that have an icon or indicator. */
    inset?: boolean;
  },
) => {
  const { className, inset, children, ...rest } = props;

  return (
    <MenuPrimitive.SubTrigger
      className={cn(
        "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground not-data-[variant=destructive]:hover:**:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground gap-1.5 rounded-md px-1.5 py-1 text-sm data-inset:ps-7 [&_svg:not([class*='size-'])]:size-4 flex cursor-default select-none items-center outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-inset={inset}
      data-slot="dropdown-menu-sub-trigger"
      {...rest}
    >
      {children}
      <ChevronRightIcon aria-hidden="true" className="ms-auto rtl:rotate-180" />
    </MenuPrimitive.SubTrigger>
  );
};

export const DropdownMenuSubContent = (
  props: React.ComponentProps<typeof MenuPrimitive.SubContent>,
) => {
  const { className, ...rest } = props;

  return (
    <MenuPrimitive.SubContent
      className={cn(
        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground min-w-[96px] rounded-lg p-1 shadow-lg ring-1 duration-100 z-50 max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden",
        className,
      )}
      collisionPadding={8}
      data-slot="dropdown-menu-sub-content"
      {...rest}
    />
  );
};

export const DropdownMenuLabel = DropdownMenuGroupLabel;
