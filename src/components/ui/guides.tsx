import type * as React from "react";
import { cn } from "@/components/utils";

export interface GuidesProps extends React.ComponentProps<"div"> {
  /**
   * Lets the rules run past the sides to the edges of the nearest ancestor
   * that clips (give the section `overflow-x-clip`).
   *
   * @default false
   */
  bleed?: boolean;
  /**
   * How far the lines run past the corners: none, 0.5rem, 1rem or 3.5rem.
   *
   * @default "none"
   */
  extend?: "none" | "sm" | "md" | "lg";
  /**
   * Fades the side lines (and the inner lines and gutters) in from nothing
   * at their top, their bottom or both ends.
   *
   * @default "none"
   */
  fade?: "none" | "top" | "bottom" | "both";
  /**
   * Fills the band between the sides and the inner lines: diagonal hatching
   * or a dot grid.
   *
   * @default "none"
   */
  gutter?: "none" | "hatch" | "dots";
  /**
   * A second pair of side lines, inset from the sides by `inset`.
   *
   * @default "none"
   */
  inner?: "none" | "solid" | "dashed";
  /**
   * How far the inner lines (and the gutters) sit from the sides: 0.75rem,
   * 1rem then 2rem from `sm`, or 1.5rem then 3rem from `sm`.
   *
   * @default "md"
   */
  inset?: "sm" | "md" | "lg";
  /**
   * The marks' shape: a plus, a dot, or a small square.
   *
   * @default "plus"
   */
  markShape?: "plus" | "dot" | "square";
  /**
   * Marks on the corners: none, the top-start corner, the two top corners,
   * the two bottom corners, or all four.
   *
   * @default "none"
   */
  marks?: "none" | "start" | "top" | "bottom" | "corners";
  /**
   * Which horizontal edges get a line. A section in a stack of sections
   * draws only its `top` rule, so two sections never double a line.
   *
   * @default "both"
   */
  rules?: "both" | "top" | "bottom" | "none";
  /**
   * Draws the two side lines.
   *
   * @default true
   */
  sides?: boolean;
  /**
   * The outer lines' style.
   *
   * @default "solid"
   */
  variant?: "solid" | "dashed";
}

const extendY = {
  lg: "-inset-y-14",
  md: "-inset-y-4",
  none: "-inset-y-px",
  sm: "-inset-y-2",
};

const extendX = {
  lg: "-inset-x-14",
  md: "-inset-x-4",
  none: "-inset-x-px",
  sm: "-inset-x-2",
};

const fadeMask = {
  both: "[mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]",
  bottom: "[mask-image:linear-gradient(to_top,transparent,black_40%)]",
  none: "",
  top: "[mask-image:linear-gradient(to_bottom,transparent,black_40%)]",
};

const insetSize = {
  lg: "[--guides-inset:1.5rem] sm:[--guides-inset:3rem]",
  md: "[--guides-inset:1rem] sm:[--guides-inset:2rem]",
  sm: "[--guides-inset:0.75rem]",
};

const gutterFill = {
  dots: "bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[8px_8px]",
  hatch:
    "bg-[repeating-linear-gradient(-45deg,var(--border)_0_1px,transparent_1px_7px)]",
  none: "",
};

/** The corners a mark sits on, centred on the crossing of the two lines. */
const markCorners = {
  "bottom-end":
    "end-0 bottom-0 translate-x-[calc(50%+0.5px)] translate-y-[calc(50%+0.5px)] rtl:-translate-x-[calc(50%+0.5px)]",
  "bottom-start":
    "start-0 bottom-0 -translate-x-[calc(50%+0.5px)] translate-y-[calc(50%+0.5px)] rtl:translate-x-[calc(50%+0.5px)]",
  "top-end":
    "end-0 top-0 translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)] rtl:-translate-x-[calc(50%+0.5px)]",
  "top-start":
    "start-0 top-0 -translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)] rtl:translate-x-[calc(50%+0.5px)]",
};

type Corner = keyof typeof markCorners;

const cornersFor: Record<NonNullable<GuidesProps["marks"]>, Corner[]> = {
  bottom: ["bottom-start", "bottom-end"],
  corners: ["top-start", "top-end", "bottom-start", "bottom-end"],
  none: [],
  start: ["top-start"],
  top: ["top-start", "top-end"],
};

export const Guides = (props: GuidesProps) => {
  const {
    bleed = false,
    className,
    extend = "none",
    fade = "none",
    gutter = "none",
    inner = "none",
    inset = "md",
    markShape = "plus",
    marks = "none",
    rules = "both",
    sides = true,
    variant = "solid",
    ...rest
  } = props;
  const dashed = variant === "dashed" ? "border-dashed" : "";
  const rulesInset = bleed ? "-inset-x-[100vw]" : extendX[extend];
  const top = rules === "both" || rules === "top";
  const bottom = rules === "both" || rules === "bottom";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 border-0",
        insetSize[inset],
        className,
      )}
      data-slot="guides"
      {...rest}
    >
      {gutter === "none" ? null : (
        <>
          <div
            className={cn(
              "absolute inset-y-0 start-0 w-(--guides-inset)",
              gutterFill[gutter],
              fadeMask[fade],
            )}
            data-slot="guides-gutter"
          />
          <div
            className={cn(
              "absolute inset-y-0 end-0 w-(--guides-inset)",
              gutterFill[gutter],
              fadeMask[fade],
            )}
            data-slot="guides-gutter"
          />
        </>
      )}
      {inner === "none" ? null : (
        <>
          <div
            className={cn(
              "absolute inset-y-0 start-(--guides-inset) w-px border-s",
              inner === "dashed" ? "border-dashed" : "",
              fadeMask[fade],
            )}
            data-slot="guides-line"
          />
          <div
            className={cn(
              "absolute inset-y-0 end-(--guides-inset) w-px border-s",
              inner === "dashed" ? "border-dashed" : "",
              fadeMask[fade],
            )}
            data-slot="guides-line"
          />
        </>
      )}
      {sides ? (
        <>
          <div
            className={cn(
              "absolute -start-px w-px border-s",
              extendY[extend],
              fadeMask[fade],
              dashed,
            )}
            data-slot="guides-line"
          />
          <div
            className={cn(
              "absolute -end-px w-px border-s",
              extendY[extend],
              fadeMask[fade],
              dashed,
            )}
            data-slot="guides-line"
          />
        </>
      ) : null}
      {top ? (
        <div
          className={cn("absolute -top-px h-px border-t", rulesInset, dashed)}
          data-slot="guides-line"
        />
      ) : null}
      {bottom ? (
        <div
          className={cn(
            "absolute -bottom-px h-px border-t",
            rulesInset,
            dashed,
          )}
          data-slot="guides-line"
        />
      ) : null}
      {cornersFor[marks].map((corner) => (
        <svg
          aria-hidden="true"
          className={cn(
            "absolute size-3.5 text-muted-foreground",
            markCorners[corner],
          )}
          data-slot="guides-mark"
          fill="none"
          key={corner}
          stroke="currentColor"
          strokeWidth={1}
          viewBox="0 0 14 14"
        >
          {markShape === "plus" ? <path d="M7 0v14M0 7h14" /> : null}
          {markShape === "dot" ? (
            <circle cx="7" cy="7" fill="currentColor" r="2" stroke="none" />
          ) : null}
          {markShape === "square" ? (
            <rect
              className="fill-background"
              height="5"
              width="5"
              x="4.5"
              y="4.5"
            />
          ) : null}
        </svg>
      ))}
    </div>
  );
};
