import { View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { useToastStore } from "../../store/toastStore";
import "./GlobalToast.scss";

// 微信小程序端 ScrollView 实现有问题，全局浮层卸载会触发页面重绘，
// 导致页面 ScrollView 回顶 (scrollTop=0)。故在微信小程序环境需要手动
// 保持组件挂载状态，仅切换可见性。
const KEEP_MOUNTED = process.env.TARO_ENV === "weapp";

export function GlobalToast() {
  const queue = useToastStore((s) => s.queue);
  const shift = useToastStore((s) => s.shift);
  const current = queue[0] || null;
  const currentId = current?.id || "";

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!currentId) {
      setVisible(false);
      return;
    }
    setVisible(false);
    const t1 = setTimeout(() => setVisible(true), 0);
    const t2 = setTimeout(() => setVisible(false), 2200);
    const t3 = setTimeout(() => shift(), 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [currentId, shift]);

  if (!current && !KEEP_MOUNTED) return null;
  return (
    <View className={`gt-root ${visible ? "gt-open" : "gt-close"}`}>
      <View className='gt-bubble'>{current?.message ?? ""}</View>
    </View>
  );
}
