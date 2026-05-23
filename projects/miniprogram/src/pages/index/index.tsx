import { Button, Input, View } from "@tarojs/components";
import Taro, { useDidShow, useLoad } from "@tarojs/taro";
import { useState } from "react";
import { ensureLogin, getMe } from "../../api/auth";
import type { StoreDTO } from "../../api/types";
import { useAppRouter } from "../../hooks/useAppRouter";
import "./index.scss";
import { extractTableIdFromScanPath } from "../../utils/codeParser";
import { getPlatformBranding } from "../../api/platform";
import { getRecentStore } from "../../store/recentStore";
import { getStoreDisplayName } from "../../utils/store";

export default function Index() {
  const isH5 = process.env.TARO_ENV === "h5";
  const icpText = isH5 ? "浙ICP备2022018560号-4" : "浙ICP备2022018560号-3X";
  const router = useAppRouter();
  const [tableId, setTableId] = useState("");
  const [store, setStore] = useState<StoreDTO | null>(null);
  const [branding, setBranding] = useState<{ platformName: string; platformLogoUrl: string | null } | null>(null);
  const [me, setMe] = useState<{ nickname: string; avatarUrl: string } | null>(null);

  const refreshStore = async () => {
    const cached = getRecentStore();
    if (cached) {
      setStore(cached);
      setBranding(null);
      return;
    }
    setStore(null);
    try {
      const b = await getPlatformBranding();
      setBranding(b);
    } catch {
      void 0;
    }
  };

  useLoad(() => {
    void (async () => {
      try {
        await ensureLogin();
        const u = await getMe();
        setMe({ nickname: u.nickname || "", avatarUrl: u.avatarUrl || "" });
      } catch {
        void 0;
      }
      await refreshStore();
    })();
  });

  useDidShow(() => {
    void (async () => {
      try {
        await ensureLogin();
        const u = await getMe();
        setMe({ nickname: u.nickname || "", avatarUrl: u.avatarUrl || "" });
      } catch {
        void 0;
      }
      await refreshStore();
    })();
  });

  return (
    <View className='page-index'>
      <View className='card'>
        <View className='store-row'>
          <View className='store-left'>
            <View className='title'>{getStoreDisplayName(store) || branding?.platformName || "BiteGo 点点餐"}</View>
            <View className='meta'>
              {store?.address ? <View className='meta-line'>{store.address}</View> : null}
              {store?.phone ? <View className='meta-line'>{store.phone}</View> : null}
              {store?.description ? <View className='meta-line'>{store.description}</View> : null}
            </View>
          </View>
          {store?.logoUrl || branding?.platformLogoUrl ? (
            <View
              className='store-logo'
              style={{ backgroundImage: `url(${store?.logoUrl || branding?.platformLogoUrl || ""})` }}
            />
          ) : null}
        </View>
        <View className='profile-row' onClick={() => router.toProfileEdit()}>
          <View
            className='profile-avatar'
            style={me?.avatarUrl ? { backgroundImage: `url(${me.avatarUrl})` } : undefined}
          >
            {!me?.avatarUrl ? <View className='profile-avatar-text'>匿</View> : null}
          </View>
          <View className='profile-name'>{me?.nickname || "点击设置昵称头像"}</View>
        </View>
        <View className='desc'>扫码即可开始点餐</View>
        <Button
          className='primary-btn'
          onClick={async () => {
            try {
              const r = await Taro.scanCode({
                onlyFromCamera: false,
                // @ts-ignore
                scanType: ["wxCode", "qrCode"],
              });
              const tid = extractTableIdFromScanPath(String((r as any)?.path || (r as any)?.result || ""));
              if (!tid) {
                await Taro.showToast({ title: "二维码无效", icon: "none" });
                return;
              }
              router.toOrderMeal({ tableId: tid });
            } catch {
              await Taro.showToast({ title: "扫码失败", icon: "none" });
            }
          }}
        >
          扫码点餐
        </Button>

        <View className='divider' />

        <View className='desc'>无法扫码时可手动输入桌台 ID</View>
        <Input
          className='input'
          placeholder='请输入 tableId'
          value={tableId}
          onInput={(e) => setTableId(String(e.detail.value || ""))}
        />
        <Button
          className='secondary-btn'
          onClick={async () => {
            const tid = tableId.trim();
            if (!tid) {
              await Taro.showToast({ title: "请输入 tableId", icon: "none" });
              return;
            }
            router.toOrderMeal({ tableId: tid });
          }}
        >
          进入点餐页
        </Button>

        <Button className='link-btn' onClick={() => router.toHistoryOrders()}>
          历史订单
        </Button>
      </View>
      <View className='divider' />
      <View className='card'>
        <View className='fuck-reviewer'>请注意：</View>“点点餐
        BiteGo”小程序系上海大学计算机工程与科学学院计算机科学与技术专业本科生王锐(22121355)的
        <View className='fuck-reviewer-text'>毕业设计作品</View>
        。小程序内容仅供毕业设计使用和展示，<View className='fuck-reviewer-text'>不涉及</View>
        任何真实交易链路，且<View className='fuck-reviewer-text'>不会</View>用于商业用途。
      </View>
      <View className='icp'>
        <View>&copy; BiteGo.net</View>
        <View
          onClick={() => {
            if (!isH5) return;
            if (typeof window !== "undefined")
              window.open("https://beian.miit.gov.cn", "_blank", "noopener,noreferrer");
          }}
          style={isH5 ? { textDecoration: "underline" } : undefined}
        >
          {icpText}
        </View>
      </View>
    </View>
  );
}
