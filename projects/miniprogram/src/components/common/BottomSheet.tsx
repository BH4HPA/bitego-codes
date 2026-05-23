import { View } from "@tarojs/components";
import { PropsWithChildren, useEffect, useState } from "react";
import "./BottomSheet.scss";

const BS_ANIM_MS = 220;
const BS_UNMOUNT_DELAY_MS = BS_ANIM_MS + 80;

export function BottomSheet(
  props: PropsWithChildren<{
    open: boolean;
    title?: React.ReactNode;
    onClose: () => void;
    height?: string;
    footer?: JSX.Element | null;
  }>,
) {
  const [render, setRender] = useState(props.open);
  const [visible, setVisible] = useState(props.open);

  // 微信小程序端 ScrollView 实现有问题，七分屏卸载后页面流将重绘，导致 ScrollView
  // 回顶(scrollTop=0)，故在微信小程序环境需要手动保持组件挂载状态，避免重绘
  // 以避免在七分屏关闭后，滚动位置被重置的问题。
  const keepMounted = process.env.TARO_ENV === "weapp";

  useEffect(() => {
    if (props.open) {
      setRender(true);
      setVisible(false);
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    if (!render) return;
    setVisible(false);
    if (!keepMounted) {
      const t = setTimeout(() => setRender(false), BS_UNMOUNT_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [props.open, render, keepMounted]);

  if (!render) return null;
  return (
    <View className={`bs-root ${visible ? "bs-state-open" : "bs-state-close"}`}>
      <View className='bs-mask' onClick={props.onClose} />
      <View className='bs-panel' style={{ height: props.height || "70vh" }}>
        <View className='bs-header'>
          <View className='bs-title'>{props.title || ""}</View>
          <View className='bs-close-btn' onClick={props.onClose}>
            ×
          </View>
        </View>
        <View className='bs-body'>{props.children}</View>
        {props.footer ? <View className='bs-footer'>{props.footer}</View> : null}
      </View>
    </View>
  );
}
