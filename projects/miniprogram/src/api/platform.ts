import { request } from "./request";

export type PlatformBrandingDTO = {
  platformName: string;
  platformLogoUrl: string | null;
};

export async function getPlatformBranding() {
  return await request<PlatformBrandingDTO>({ path: "/platform/branding", method: "GET" });
}
