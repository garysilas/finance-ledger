// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { describe, expect, it } from "vitest";

import { PreviewFrameProvider, usePopupContainer } from "./preview-frame";

type Container = Element | DocumentFragment | null | undefined;

// Reads the resolved container out of the hook for assertions.
function Probe(props: { own?: Container; onResolve?: (c: Container) => void }) {
  const { container, withSource } = usePopupContainer(props.own);
  props.onResolve?.(container);
  return withSource(<span data-testid="source">trigger</span>);
}

describe("usePopupContainer", () => {
  it("defaults to document.body once hydrated outside a preview", () => {
    let resolved: Container;
    render(<Probe onResolve={(c) => (resolved = c)} />);
    expect(resolved!).toBe(document.body);
  });

  it("prefers the author's own container over the default", () => {
    const own = document.createElement("section");
    let resolved: Container;
    render(<Probe own={own} onResolve={(c) => (resolved = c)} />);
    expect(resolved!).toBe(own);
  });

  it("keeps an explicit null container in place", () => {
    let resolved: Container = document.body;
    render(<Probe own={null} onResolve={(c) => (resolved = c)} />);
    expect(resolved).toBeNull();
  });

  it("portals into the preview portal node inside a preview frame", () => {
    const node = document.createElement("div");
    let resolved: Container;
    render(
      <PreviewFrameProvider container={node}>
        <Probe onResolve={(c) => (resolved = c)} />
      </PreviewFrameProvider>,
    );
    expect(resolved!).toBe(node);
  });

  it("stays in place inside a preview frame with no portal node", () => {
    let resolved: Container = document.body;
    render(
      <PreviewFrameProvider>
        <Probe onResolve={(c) => (resolved = c)} />
      </PreviewFrameProvider>,
    );
    expect(resolved).toBeUndefined();
  });

  it("renders the wrapped node through withSource", () => {
    render(<Probe />);
    expect(screen.getByTestId("source")).toHaveTextContent("trigger");
  });

  it("carries the source direction and language into the portal container", () => {
    function Localized() {
      const { container, withSource } = usePopupContainer();
      return (
        <div dir="rtl" lang="ar">
          {withSource(<button type="button">trigger</button>)}
          {container instanceof Element
            ? createPortal(<mark data-testid="popup" />, container)
            : null}
        </div>
      );
    }
    render(<Localized />);
    const popup = screen.getByTestId("popup");
    const holder = popup.parentElement;
    expect(holder).toHaveAttribute("data-slot", "popup-locale");
    expect(holder).toHaveAttribute("dir", "rtl");
    expect(holder).toHaveAttribute("lang", "ar");
  });
});
