"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import type React from "react";
import { cn } from "@/components/utils";

export const Avatar = (
  props: React.ComponentProps<typeof AvatarPrimitive.Root> & {
    size?: "default" | "sm" | "lg";
  },
) => {
  const { className, size = "default", ...rest } = props;

  return (
    <AvatarPrimitive.Root
      className={cn(
        "size-8 rounded-full after:rounded-full data-[size=lg]:size-10 data-[size=sm]:size-6 group/avatar relative flex shrink-0 select-none after:absolute after:inset-0 after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten",
        className,
      )}
      data-size={size}
      data-slot="avatar"
      {...rest}
    />
  );
};

export const AvatarImage = (
  props: React.ComponentProps<typeof AvatarPrimitive.Image>,
) => {
  const { className, ...rest } = props;

  return (
    <AvatarPrimitive.Image
      className={cn(
        "rounded-full aspect-square size-full object-cover",
        className,
      )}
      data-slot="avatar-image"
      {...rest}
    />
  );
};

export const AvatarFallback = (
  props: React.ComponentProps<typeof AvatarPrimitive.Fallback>,
) => {
  const { className, ...rest } = props;

  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "bg-muted text-muted-foreground rounded-full flex size-full items-center justify-center text-sm group-data-[size=sm]/avatar:text-xs",
        className,
      )}
      data-slot="avatar-fallback"
      {...rest}
    />
  );
};

export const AvatarBadge = (props: React.ComponentProps<"span">) => {
  const { className, ...rest } = props;

  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground ring-background absolute inset-e-0 bottom-0 z-10 inline-flex select-none items-center justify-center rounded-full bg-blend-color ring-2",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className,
      )}
      data-slot="avatar-badge"
      {...rest}
    />
  );
};

export const AvatarGroup = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className,
      )}
      data-slot="avatar-group"
      {...rest}
    />
  );
};

export const AvatarGroupCount = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground size-8 rounded-full text-sm group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3 relative flex shrink-0 items-center justify-center ring-2 ring-background",
        className,
      )}
      data-slot="avatar-group-count"
      {...rest}
    />
  );
};
