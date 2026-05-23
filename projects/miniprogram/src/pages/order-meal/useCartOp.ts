import Taro from "@tarojs/taro";
import { useCallback } from "react";
import { useTableSessionStore } from "../../store/tableSessionStore";

export function useCartOp() {
  const isWsOpen = useTableSessionStore((s) => s.isWsOpen);
  return useCallback(
    async (action: () => Promise<boolean>, opts?: { successTitle?: string }) => {
      const showLoading = !isWsOpen();
      if (showLoading) await Taro.showLoading({ title: "", mask: true });
      let ok = false;
      try {
        ok = await action();
      } finally {
        if (showLoading) await Taro.hideLoading();
      }
      if (!ok) {
        await Taro.showToast({ title: "连接失败，请稍后重试", icon: "none" });
        return false;
      }
      if (opts?.successTitle) {
        await Taro.showToast({ title: opts.successTitle, icon: "success" });
      }
      return true;
    },
    [isWsOpen],
  );
}
