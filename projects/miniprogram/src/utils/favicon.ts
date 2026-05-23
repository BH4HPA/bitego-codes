export function setFavicon(url: string): void {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head || !url) return;
  const existing = head.querySelectorAll('link[rel~="icon"]');
  existing.forEach((node) => node.parentNode?.removeChild(node));
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = url;
  head.appendChild(link);
}
