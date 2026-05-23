import { request } from "./request";
import type { UserDTO } from "./types";
import { setToken } from "../store/token";
import { bumpUserProfileVer, setUser } from "../store/user";

export async function updateMyProfile(params: { nickname: string; avatarUrl: string }) {
  const data = await request<{ token: string; user: UserDTO }>({
    path: "/users/me/profile",
    method: "PUT",
    data: { nickname: params.nickname, avatarUrl: params.avatarUrl },
  });
  setToken(data.token);
  setUser({ userId: data.user.userId, nickname: data.user.nickname || "", avatarUrl: data.user.avatarUrl || "" });
  bumpUserProfileVer();
  return data;
}
