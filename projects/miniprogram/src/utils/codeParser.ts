const safeDecodeURIComponent = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const parseQueryString = (qs: string) => {
  const out: Record<string, string> = {};
  const raw = String(qs || "").replace(/^\?/, "");
  for (const part of raw.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = i >= 0 ? part.slice(0, i) : part;
    const v = i >= 0 ? part.slice(i + 1) : "";
    const key = safeDecodeURIComponent(k);
    if (!key) continue;
    out[key] = safeDecodeURIComponent(v);
  }
  return out;
};

export const extractTableIdFromScanPath = (rawPath: string | undefined) => {
  const src = String(rawPath || "");
  if (!src) return "";
  const candidates = [src, safeDecodeURIComponent(src)];
  for (const p of candidates) {
    const qIndex = p.indexOf("?");
    if (qIndex >= 0) {
      const params = parseQueryString(p.slice(qIndex + 1));
      const direct = params.tableId ? String(params.tableId) : "";
      if (direct) return direct;
      const sceneRaw = params.scene ? String(params.scene) : "";
      if (sceneRaw) {
        const scene = safeDecodeURIComponent(sceneRaw);
        const sceneParams = parseQueryString(scene);
        const fromScene = sceneParams.tableId ? String(sceneParams.tableId) : "";
        if (fromScene) return fromScene;
        const m2 = scene.match(/tableId=([^&\s]+)/);
        if (m2?.[1]) return String(m2[1]);
      }
    }
    const m = p.match(/tableId=([^&\s]+)/);
    if (m?.[1]) return String(m[1]);
  }
  return "";
};
