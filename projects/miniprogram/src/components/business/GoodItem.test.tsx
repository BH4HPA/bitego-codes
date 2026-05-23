import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoodItem } from "./GoodItem";

vi.mock("@tarojs/components", async () => {
  const React = await import("react");
  type P = Record<string, unknown> & { children?: React.ReactNode };
  return {
    View: (props: P) => React.createElement("div", props),
    Image: (props: P) => React.createElement("img", props),
    Text: (props: P) => React.createElement("span", props),
  };
});

describe("GoodItem", () => {
  it("renders good info and handles click", () => {
    const onClick = vi.fn();
    render(
      <GoodItem
        onClick={onClick}
        good={{
          goodId: "g1",
          name: "菜品1",
          description: "一句话",
          imageUrls: [],
          categoryId: "cat",
          sales: 12,
          status: "ON_SHELF",
          basePriceCents: 0,
          minPriceCents: 100,
        }}
      />,
    );

    expect(screen.getByText("菜品1")).toBeTruthy();
    expect(screen.getByText("一句话")).toBeTruthy();
    expect(screen.getByText("已售 12")).toBeTruthy();
    fireEvent.click(screen.getByText("菜品1"));
    expect(onClick).toHaveBeenCalled();
  });
});
