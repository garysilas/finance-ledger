import type React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/components/utils";

export const Empty = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn(
        "gap-4 rounded-xl border-dashed p-6 flex w-full min-w-0 max-w-full flex-1 flex-col items-center justify-center text-balance text-center",
        className,
      )}
      data-slot="empty"
      {...rest}
    />
  );
};

export const EmptyHeader = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn("gap-2 flex max-w-sm flex-col items-center", className)}
      data-slot="empty-header"
      {...rest}
    />
  );
};

const emptyMediaVariants = tv({
  base: "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "bg-transparent",
      icon: "bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-4",
    },
  },
});

export const EmptyMedia = (
  props: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>,
) => {
  const { className, variant = "default", ...rest } = props;

  return (
    <div
      className={cn(emptyMediaVariants({ variant }), className)}
      data-slot="empty-icon"
      data-variant={variant}
      {...rest}
    />
  );
};

export const EmptyTitle = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn(
        "text-sm font-medium tracking-tight font-heading",
        className,
      )}
      data-slot="empty-title"
      {...rest}
    />
  );
};

export const EmptyDescription = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn(
        "text-sm/relaxed text-muted-foreground [&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
        className,
      )}
      data-slot="empty-description"
      {...rest}
    />
  );
};

export const EmptyContent = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn(
        "gap-2.5 text-sm flex w-full min-w-0 max-w-sm flex-col items-center text-balance",
        className,
      )}
      data-slot="empty-content"
      {...rest}
    />
  );
};
