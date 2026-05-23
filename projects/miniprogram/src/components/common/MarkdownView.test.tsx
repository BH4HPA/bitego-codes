import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownView } from "./MarkdownView";

vi.mock("@tarojs/components", async () => {
  const React = await import("react");
  type P = Record<string, unknown> & { children?: React.ReactNode; nodes?: unknown };
  return {
    View: (props: P) => React.createElement("div", props),
    RichText: (props: P) =>
      React.createElement("div", { "data-testid": "rt", "data-nodes": String(props.nodes || "") }),
  };
});

describe("MarkdownView", () => {
  it("sanitizes script/style and inline events", () => {
    render(<MarkdownView markdown='hello <script>alert(1)</script><div onclick="x()">x</div>' />);
    const el = screen.getByTestId("rt");
    const html = el.getAttribute("data-nodes") || "";
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick=");
  });
});
