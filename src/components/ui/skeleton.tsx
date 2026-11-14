import type React from "react";
import { cn } from "@/components/utils";

export const Skeleton = (props: React.ComponentProps<"div">) => {
  const { className, ...rest } = props;

  return (
    <div
      className={cn(
        "bg-muted rounded-md animate-pulse motion-reduce:animate-none",
        className,
      )}
      data-slot="skeleton"
      {...rest}
    />
  );
};
