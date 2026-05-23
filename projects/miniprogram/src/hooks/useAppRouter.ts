import { useMemo } from "react";
import { router } from "../utils/router";

export function useAppRouter() {
  return useMemo(() => router, []);
}
