import { Button, Input, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { ensureLogin, getMe } from "../../../../api/auth";
import { uploadImage } from "../../../../api/files";
import { updateMyProfile } from "../../../../api/users";
import "./index.scss";

function isTmpFilePath(v: string) {
  const s = String(v || "").trim();
  if (!s) return false;
  if (s.startsWith("wxfile://")) return true;
  if (s.startsWith("file://")) return true;
  if (s.startsWith("blob:")) return true;
  if (/^https?:\/\/tmp\//.test(s)) return true;
  if (s.startsWith("http://tmp/")) return true;
  return false;
}

async function chooseAvatarOnH5(): Promise<string> {
  try {
    const res = await Taro.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
    });
    return String(res?.tempFilePaths?.[0] || "");
  } catch {
    return "";
  }
}

export default function ProfileEditPage() {
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarTempPath, setAvatarTempPath] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const isH5 = process.env.TARO_ENV === "h5";

  const applyChosenAvatar = (url: string) => {
    if (!url) return;
    setAvatarTempPath(url);
    setAvatarPreview(url);
  };

  const avatarButtonProps = isH5
    ? {
        onClick: async () => {
          const picked = await chooseAvatarOnH5();
          applyChosenAvatar(picked);
        },
      }
    : ({
        openType: "chooseAvatar" as const,
        onChooseAvatar: (e: unknown) => {
          const url = String((e as { detail?: { avatarUrl?: string } })?.detail?.avatarUrl || "");
          applyChosenAvatar(url);
        },
      } as const);

  useLoad(() => {
    void (async () => {
      try {
        await ensureLogin();
        const me = await getMe();
        setNickname(me.nickname || "");
        setAvatarPreview(me.avatarUrl || "");
      } catch {
        void 0;
      }
    })();
  });

  return (
    <View className='page-profile-edit'>
      <View className='card'>
        <View className='row'>
          <View className='label'>头像</View>
          <Button className='avatar-btn' {...avatarButtonProps}>
            <View className='avatar' style={avatarPreview ? { backgroundImage: `url(${avatarPreview})` } : undefined}>
              {!avatarPreview ? "匿" : null}
            </View>
          </Button>

          <View className='label'>昵称</View>
          <Input
            className='input'
            type='nickname'
            value={nickname}
            maxlength={20}
            placeholder='请输入昵称'
            onInput={(e) => setNickname(String((e as any)?.detail?.value || ""))}
          />

          <Button
            className='btn'
            loading={saving}
            disabled={saving || !nickname.trim()}
            onClick={async () => {
              if (saving) return;
              const n = nickname.trim();
              if (!n || n.length > 20) {
                await Taro.showToast({ title: "请输入合法昵称", icon: "none" });
                return;
              }
              setSaving(true);
              try {
                let avatarUrl = avatarPreview;
                const candidate = avatarTempPath || avatarPreview;
                if (candidate && isTmpFilePath(candidate)) {
                  avatarUrl = await uploadImage({ filePath: candidate, path: "avatars" });
                } else if (avatarTempPath && !/^https?:\/\//.test(avatarTempPath)) {
                  avatarUrl = await uploadImage({ filePath: avatarTempPath, path: "avatars" });
                }
                if (!avatarUrl) {
                  await Taro.showToast({ title: "请设置头像", icon: "none" });
                  return;
                }
                await updateMyProfile({ nickname: n, avatarUrl });
                await Taro.showToast({ title: "保存成功", icon: "success" });
                setTimeout(() => {
                  Taro.navigateBack();
                }, 300);
              } catch (e) {
                await Taro.showToast({ title: e instanceof Error ? e.message : "保存失败", icon: "none" });
              } finally {
                setSaving(false);
              }
            }}
          >
            保存
          </Button>
        </View>
      </View>
    </View>
  );
}
