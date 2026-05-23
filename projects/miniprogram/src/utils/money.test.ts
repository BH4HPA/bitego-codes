import { describe, expect, it } from "vitest";
import { centsToYuan, formatCents, parseYuanToCents } from "./money";

describe("money", () => {
  it("formats cents", () => {
    expect(centsToYuan(0)).toBe("0.00");
    expect(centsToYuan(1)).toBe("0.01");
    expect(formatCents(199)).toBe("¥1.99");
  });

  it("parses yuan", () => {
    expect(parseYuanToCents("")).toBe(0);
    expect(parseYuanToCents("1")).toBe(100);
    expect(parseYuanToCents("1.23")).toBe(123);
  });
});
