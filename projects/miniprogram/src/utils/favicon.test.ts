import { beforeEach, describe, expect, it } from "vitest";
import { setFavicon } from "./favicon";

describe("favicon", () => {
  beforeEach(() => {
    document.head.querySelectorAll('link[rel~="icon"]').forEach((node) => node.parentNode?.removeChild(node));
  });

  it("injects an icon link when none exists", () => {
    setFavicon("https://cdn.example.com/logo.png");
    const links = document.head.querySelectorAll('link[rel~="icon"]');
    expect(links.length).toBe(1);
    expect((links[0] as HTMLLinkElement).href).toBe("https://cdn.example.com/logo.png");
  });

  it("replaces an existing icon link", () => {
    const prior = document.createElement("link");
    prior.rel = "icon";
    prior.href = "https://cdn.example.com/old.png";
    document.head.appendChild(prior);

    setFavicon("https://cdn.example.com/new.png");

    const links = document.head.querySelectorAll('link[rel~="icon"]');
    expect(links.length).toBe(1);
    expect((links[0] as HTMLLinkElement).href).toBe("https://cdn.example.com/new.png");
  });

  it("ignores empty urls", () => {
    setFavicon("");
    expect(document.head.querySelectorAll('link[rel~="icon"]').length).toBe(0);
  });
});
