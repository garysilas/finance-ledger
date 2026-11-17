"use client";

import {
  createContext,
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  version,
} from "react";

const PreviewFrameContext = createContext(false);

const PreviewPortalNodeContext = createContext<HTMLElement | null>(null);

export const PreviewFrameProvider = (props: {
  children: ReactNode;
  container?: HTMLElement | null;
}) => (
  <PreviewFrameContext.Provider value={true}>
    <PreviewPortalNodeContext.Provider value={props.container ?? null}>
      {props.children}
    </PreviewPortalNodeContext.Provider>
  </PreviewFrameContext.Provider>
);

export const usePreviewFrame = () => useContext(PreviewFrameContext);

export const usePreviewPortal = () => useContext(PreviewPortalNodeContext);

/** What a popup's `container` takes: an element, a shadow root, `null` for in place. */
type PopupContainer = Element | DocumentFragment | null | undefined;

/** The part of React 19.3's `FragmentInstance` read here. */
interface FragmentHandle {
  dispatchEvent: (event: Event) => boolean;
  getRootNode: () => unknown;
}

const [major = 0, minor = 0] = version.split(".").map(Number);
/** `<Fragment ref>`, which finds where a popup is written without a wrapper element. */
const fragmentRefs = major > 19 || (major === 19 && minor >= 3);

const PROBE = "popup-source-probe";

/** The element a fragment sits in: the target of an event dispatched on it. */
const parentOf = (fragment: FragmentHandle | null): Element | null => {
  const root = fragment?.getRootNode();
  if (!(root instanceof Document || root instanceof ShadowRoot)) {
    return null;
  }
  let parent: Element | null = null;
  const catchProbe = (event: Event) => {
    event.stopPropagation();
    parent = event.target instanceof Element ? event.target : null;
  };
  root.addEventListener(PROBE, catchProbe, { capture: true });
  fragment?.dispatchEvent(new Event(PROBE, { bubbles: true }));
  root.removeEventListener(PROBE, catchProbe, { capture: true });
  return parent;
};

/** The direction and language an element reads in, as a key. */
const localeOf = (el: Element) => {
  const lang = el.closest("[lang]")?.getAttribute("lang");
  return {
    dir: getComputedStyle(el).direction === "rtl" ? "rtl" : "ltr",
    lang: lang ?? null,
  };
};

/**
 * One `display: contents` element per direction and language in a container,
 * shared by the popups written in them, kept while one of them is mounted.
 */
const holders = new WeakMap<
  Element,
  Map<string, { count: number; el: HTMLElement }>
>();

const holdLocale = (base: HTMLElement, dir: string, lang: string | null) => {
  const key = `${dir}|${lang ?? ""}`;
  let byKey = holders.get(base);
  if (!byKey) {
    byKey = new Map();
    holders.set(base, byKey);
  }
  let entry = byKey.get(key);
  if (!entry) {
    const el = base.ownerDocument.createElement("div");
    el.setAttribute("data-slot", "popup-locale");
    el.setAttribute("dir", dir);
    if (lang !== null) {
      el.setAttribute("lang", lang);
    }
    el.style.display = "contents";
    base.append(el);
    entry = { count: 0, el };
    byKey.set(key, entry);
  }
  const held = entry;
  held.count += 1;
  return {
    el: held.el,
    release: () => {
      held.count -= 1;
      if (held.count === 0) {
        held.el.remove();
        byKey.delete(key);
      }
    },
  };
};

/** Runs `sync` whenever a `dir` or `lang` attribute changes in the document. */
const watchers = new Set<() => void>();
let observer: MutationObserver | undefined;
const watchLocale = (sync: () => void) => {
  watchers.add(sync);
  if (!observer) {
    observer = new MutationObserver(() => {
      for (const run of watchers) {
        run();
      }
    });
    observer.observe(document.documentElement, {
      attributeFilter: ["dir", "lang"],
      subtree: true,
    });
  }
  return () => {
    watchers.delete(sync);
    if (watchers.size === 0) {
      observer?.disconnect();
      observer = undefined;
    }
  };
};

const subscribeNever = () => () => undefined;

/**
 * Where a popup portals by default: the docs preview's portal node inside a
 * preview, else `document.body` once hydrated; `undefined` (in place) on the
 * server, during hydration and while a preview's node mounts, so the HTML
 * matches. A `container` of the author's (`own`) wins, and `null` stays in
 * place.
 *
 * A portaled popup keeps the direction and language of where it's written:
 * render the root through `withSource`, and the popup goes into an element
 * carrying that `dir` and `lang` when they differ from the container's,
 * kept in sync as `dir` and `lang` attributes change. (React 19.3 and up,
 * which can ref a fragment; before, it takes the container's.)
 */
export const usePopupContainer = (
  own?: PopupContainer,
): {
  container: PopupContainer;
  withSource: (node: ReactNode) => ReactElement;
} => {
  const inPreview = usePreviewFrame();
  const previewNode = usePreviewPortal();
  const hydrated = useSyncExternalStore<boolean>(
    subscribeNever,
    () => true,
    () => false,
  );
  const base = previewNode ?? (hydrated && !inPreview ? document.body : null);
  const tracked = own === undefined ? base : null;
  const fragment = useRef<FragmentHandle | null>(null);
  const [holder, setHolder] = useState<HTMLElement | null>(null);
  // A holder left for another stays until the popup has moved out of it.
  const left = useRef<(() => void)[]>([]);

  useLayoutEffect(() => {
    if (!(tracked && fragmentRefs)) {
      return;
    }
    const pending = left.current;
    let held: ReturnType<typeof holdLocale> | undefined;
    const sync = () => {
      const source = parentOf(fragment.current);
      const wanted = source && localeOf(source);
      const current = localeOf(tracked);
      const next =
        wanted && (wanted.dir !== current.dir || wanted.lang !== current.lang)
          ? holdLocale(tracked, wanted.dir, wanted.lang)
          : undefined;
      if (held && held.el === next?.el) {
        held.release();
      } else if (held) {
        pending.push(held.release);
      }
      held = next;
      setHolder(next?.el ?? null);
    };
    sync();
    const stop = watchLocale(sync);
    return () => {
      stop();
      held?.release();
      for (const release of pending.splice(0)) {
        release();
      }
      setHolder(null);
    };
  }, [tracked]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once the popup has rendered into the new holder.
  useLayoutEffect(() => {
    for (const release of left.current.splice(0)) {
      release();
    }
  }, [holder]);

  const setFragment = useCallback((instance: unknown) => {
    fragment.current = instance as FragmentHandle | null;
  }, []);
  const withSource = useCallback(
    (node: ReactNode) =>
      createElement(
        Fragment,
        fragmentRefs ? ({ ref: setFragment } as object) : null,
        node,
      ),
    [setFragment],
  );

  let container: PopupContainer = own;
  if (own === undefined) {
    // A holder of another container (the preview's mounting) isn't used.
    container =
      (holder && holder.parentNode === tracked ? holder : base) ?? undefined;
  }
  return { container, withSource };
};
