"use client";

import React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Below the breakpoint: exactly where `(min-width: 768px)`, Tailwind's
 * `md`, stops matching, so the two agree even at a fractional width on a
 * zoomed page.
 */
const MOBILE_QUERY = `not all and (min-width: ${MOBILE_BREAKPOINT}px)`;

/** Listens for the query's `change` event (`addListener` in Safari 13 and older). */
const subscribe = (onChange: () => void) => {
  const list = window.matchMedia(MOBILE_QUERY);
  if (list.addEventListener) {
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }
  list.addListener(onChange);
  return () => list.removeListener(onChange);
};

const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;

/** The server can't see the screen: render the wide layout until hydrated. */
const getServerSnapshot = () => false;

/**
 * Whether the viewport is narrower than 768px, kept up to date as it
 * resizes. `false` on the server and while the page hydrates.
 * @returns `true` below 768px.
 */
export const useIsMobile = (): boolean =>
  React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
