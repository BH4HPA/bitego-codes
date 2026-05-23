import { PropsWithChildren, useEffect } from "react";
import "./app.scss";
import { getPlatformBranding } from "./api/platform";
import { setFavicon } from "./utils/favicon";

function App({ children }: PropsWithChildren<any>) {
  useEffect(() => {
    if (process.env.TARO_ENV !== "h5") return;
    void (async () => {
      try {
        const branding = await getPlatformBranding();
        if (branding?.platformLogoUrl) setFavicon(branding.platformLogoUrl);
      } catch {
        void 0;
      }
    })();
  }, []);
  return children;
}

export default App;
