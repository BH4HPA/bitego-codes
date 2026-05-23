import { Button, Image, Input, ScrollView, View } from "@tarojs/components";
import Taro, { getCurrentInstance, useDidHide, useDidShow, useLoad } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensureLogin } from "../../api/auth";
import { getCategories } from "../../api/categories";
import { getGood, getGoods } from "../../api/goods";
import { getTable, resetTableSession } from "../../api/tables";
import type { CategoryDTO, GoodDetailDTO, GoodListItemDTO, GoodOptionGroupDTO, StoreDTO } from "../../api/types";
import { GoodItem } from "../../components/business/GoodItem";
import { GlobalToast } from "../../components/common/GlobalToast";
import { setRecentStore } from "../../store/recentStore";
import { useTableSessionStore } from "../../store/tableSessionStore";
import { getUser, getUserProfileVer } from "../../store/user";
import { formatCents } from "../../utils/money";
import { extractTableIdFromScanPath } from "../../utils/codeParser";
import { useAppRouter } from "../../hooks/useAppRouter";
import { getStoreDisplayName } from "../../utils/store";
import { CartSheet } from "./CartSheet";
import { GoodDetailSheet } from "./GoodDetailSheet";
import { SkuPickerSheet } from "./SkuPickerSheet";
import { useCartOp } from "./useCartOp";
import "./index.scss";

const RESUME_KEY = "orderMeal:resumeAfterProfileEdit:v1";

function sanitizeSelections(d: GoodDetailDTO, raw: Record<string, string[]>) {
  const next: Record<string, string[]> = {};
  for (const g of d.optionGroups || []) {
    const max = Number(g.maxSelection || 0) || 0;
    if (max <= 0) continue;
    const optionIdSet = new Set((g.options || []).map((o) => o.id));
    const ids = Array.isArray(raw?.[g.id]) ? raw[g.id] : [];
    const uniq = Array.from(new Set(ids.map((x) => String(x || "")).filter((x) => x)));
    const picked = uniq.filter((id) => optionIdSet.has(id)).slice(0, max);
    if (picked.length) next[g.id] = picked;
  }
  return next;
}

function buildSpecText(groups: GoodOptionGroupDTO[], selected: Record<string, string[]>) {
  const segs: string[] = [];
  for (const g of groups) {
    const ids = selected[g.id] || [];
    const sortedIds = [...ids].sort((a, b) => {
      const ia = g.options.findIndex((o) => o.id === a);
      const ib = g.options.findIndex((o) => o.id === b);
      return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
    });
    const names = sortedIds.map((id) => g.options.find((o) => o.id === id)?.name).filter(Boolean) as string[];
    if (names.length) segs.push(`${g.name}:${names.join("、")}`);
  }
  return segs.length ? segs.join(" / ") : "默认";
}

function parseSpecCombinationToOptionIdsByGroupId(groups: GoodOptionGroupDTO[], specCombination: string) {
  if (specCombination === "默认") return {} as Record<string, string[]>;
  const segs = specCombination
    .split(" / ")
    .map((x) => x.trim())
    .filter(Boolean);
  const out: Record<string, string[]> = {};
  for (const seg of segs) {
    const idx = seg.indexOf(":");
    if (idx <= 0) continue;
    const gName = seg.slice(0, idx);
    const optsStr = seg.slice(idx + 1);
    const g = groups.find((x) => x.name === gName);
    if (!g) continue;
    const names = optsStr
      .split("、")
      .map((x) => x.trim())
      .filter(Boolean);
    const ids = names.map((n) => g.options.find((o) => o.name === n)?.id).filter(Boolean) as string[];
    out[g.id] = ids;
  }
  return out;
}

function validateNonStockSelections(groups: GoodOptionGroupDTO[], selected: Record<string, string[]>) {
  for (const g of groups) {
    const max = Number(g.maxSelection || 0) || 0;
    const rawPicked = selected[g.id] || [];
    const optionIdSet = new Set(g.options.map((o) => o.id));
    const picked = rawPicked.filter((id) => optionIdSet.has(id));
    const minBase = Number(g.minSelection || 0) || 0;
    const min = g.isRequired ? Math.max(1, minBase) : minBase;
    if (max <= 0) {
      if (min > 0) return { ok: false as const, groupId: g.id, message: `请选择${g.name}` };
      continue;
    }
    if (picked.length < min) return { ok: false as const, groupId: g.id, message: `请选择${g.name}` };
    if (picked.length > max) return { ok: false as const, groupId: g.id, message: `${g.name}最多选择${max}个` };
    if (picked.length !== rawPicked.length)
      return { ok: false as const, groupId: g.id, message: `${g.name}选项已变更，请重新选择` };
  }
  return { ok: true as const };
}

export default function OrderMealPage() {
  const router = useAppRouter();
  const [tableId, setTableId] = useState("");
  const [store, setStore] = useState<StoreDTO | null>(null);
  const [lastProfileVer, setLastProfileVer] = useState(() => getUserProfileVer());
  const acquire = useTableSessionStore((s) => s.acquire);
  const release = useTableSessionStore((s) => s.release);
  const table = useTableSessionStore((s) => s.table);
  const cart = useTableSessionStore((s) => s.cart);
  const lastError = useTableSessionStore((s) => s.lastError);
  const disconnect = useTableSessionStore((s) => s.disconnect);
  const sessionClosedAt = useTableSessionStore((s) => s.sessionClosedAt);
  const sessionClosedMessage = useTableSessionStore((s) => s.sessionClosedMessage);
  const addItem = useTableSessionStore((s) => s.addItem);
  const updateQty = useTableSessionStore((s) => s.updateQty);
  const removeItem = useTableSessionStore((s) => s.removeItem);
  const storeIdFromTable = String((table as any)?.storeId || "");
  const storeFromTable = (table as any)?.store as StoreDTO | null | undefined;
  const runCartOp = useCartOp();

  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [keyword, setKeyword] = useState("");
  const [goods, setGoods] = useState<GoodListItemDTO[]>([]);
  const [loadingGoods, setLoadingGoods] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [scrollIntoView, setScrollIntoView] = useState<string>("");
  const [menuScrollIntoView, setMenuScrollIntoView] = useState<string>("");

  const [goodOpen, setGoodOpen] = useState(false);
  const [skuOpen, setSkuOpen] = useState(false);
  const [activeGood, setActiveGood] = useState<GoodDetailDTO | null>(null);
  const [loadingGood, setLoadingGood] = useState(false);
  const [selectedOptionIdsByGroupId, setSelectedOptionIdsByGroupId] = useState<Record<string, string[]>>({});
  const [invalidGroupId, setInvalidGroupId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);

  const saveResumeContext = () => {
    if (!activeGood) return;
    if (!skuOpen && !goodOpen) return;
    try {
      Taro.setStorageSync(RESUME_KEY, {
        ts: Date.now(),
        tableId,
        goodId: activeGood.goodId,
        goodOpen,
        skuOpen,
        qty,
        selectedOptionIdsByGroupId,
      });
    } catch {
      void 0;
    }
  };

  const tryRestoreResumeContext = async () => {
    if (!tableId) return;
    if (skuOpen || goodOpen) return;
    let data: any = null;
    try {
      data = Taro.getStorageSync(RESUME_KEY);
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object") return;
    if (data.tableId !== tableId) return;
    const ts = Number(data.ts || 0) || 0;
    if (!ts || Date.now() - ts > 10 * 60 * 1000) return;
    const goodId = String(data.goodId || "");
    if (!goodId) return;
    try {
      Taro.removeStorageSync(RESUME_KEY);
    } catch {
      void 0;
    }
    setLoadingGood(true);
    try {
      const sid = String((table as any)?.storeId || "");
      const d = await getGood(goodId, { storeId: sid || undefined });
      setActiveGood(d);
      setSelectedOptionIdsByGroupId(sanitizeSelections(d, data.selectedOptionIdsByGroupId || {}));
      setInvalidGroupId("");
      setQty(Math.max(1, Number(data.qty || 1) || 1));
      const nextGoodOpen = Boolean(data.goodOpen);
      const nextSkuOpen = Boolean(data.skuOpen);
      setGoodOpen(nextGoodOpen || nextSkuOpen);
      setSkuOpen(nextSkuOpen);
    } catch (e) {
      await Taro.showToast({ title: e instanceof Error ? e.message : "恢复失败", icon: "none" });
    } finally {
      setLoadingGood(false);
    }
  };

  const goodsScrollTopRef = useRef(0);
  const sectionTopsRef = useRef<Array<{ categoryId: string; top: number }>>([]);
  const activeCategoryIdRef = useRef("");
  const goodsReqSeqRef = useRef(0);
  const menuScrollTimerRef = useRef<any>(null);
  const menuScrollPendingRef = useRef("");
  const goodsScrollEndSeqRef = useRef(0);
  const goodsScrollEndTimerRef = useRef<any>(null);
  const [headerHeightPx, setHeaderHeightPx] = useState(0);

  const applyMenuScrollIntoView = (categoryId: string) => {
    const target = `menu-${categoryId}`;
    menuScrollPendingRef.current = target;
    setMenuScrollIntoView("");
    setTimeout(() => {
      if (menuScrollPendingRef.current !== target) return;
      setMenuScrollIntoView(target);
    }, 0);
  };

  const scheduleMenuScrollIntoView = (categoryId: string) => {
    const target = `menu-${categoryId}`;
    menuScrollPendingRef.current = target;
    if (menuScrollTimerRef.current) clearTimeout(menuScrollTimerRef.current);
    menuScrollTimerRef.current = setTimeout(() => {
      applyMenuScrollIntoView(categoryId);
    }, 80);
  };

  const syncActiveCategoryByScrollTop = (top: number) => {
    goodsScrollTopRef.current = top;
    const list = sectionTopsRef.current;
    if (!list.length) return;
    const threshold = 10;
    let picked = list[0]?.categoryId || "";
    for (const it of list) {
      if (top + threshold >= it.top) picked = it.categoryId;
      else break;
    }
    if (picked && activeCategoryIdRef.current !== picked) {
      activeCategoryIdRef.current = picked;
      setActiveCategoryId(picked);
      scheduleMenuScrollIntoView(picked);
    }
  };

  const stopGoodsScrollEndPoll = () => {
    goodsScrollEndSeqRef.current += 1;
    if (goodsScrollEndTimerRef.current) clearTimeout(goodsScrollEndTimerRef.current);
    goodsScrollEndTimerRef.current = null;
  };

  const startGoodsScrollEndPoll = () => {
    stopGoodsScrollEndPoll();
    const seq = (goodsScrollEndSeqRef.current += 1);
    let stable = 0;
    let lastTop = goodsScrollTopRef.current;
    const tick = () => {
      if (seq !== goodsScrollEndSeqRef.current) return;
      const q = Taro.createSelectorQuery();
      q.select(".goods-scroll").scrollOffset();
      q.exec((res) => {
        if (seq !== goodsScrollEndSeqRef.current) return;
        const info = res?.[0] as any;
        const top = Number(info?.scrollTop || 0);
        syncActiveCategoryByScrollTop(top);
        if (Math.abs(top - lastTop) < 1) stable += 1;
        else stable = 0;
        lastTop = top;
        if (stable >= 2) {
          stopGoodsScrollEndPoll();
          return;
        }
        goodsScrollEndTimerRef.current = setTimeout(tick, 60);
      });
    };
    goodsScrollEndTimerRef.current = setTimeout(tick, 60);
  };

  useLoad(async () => {
    const inst = getCurrentInstance();
    const tidFromIndex = inst?.router?.params?.tableId;
    const tidFromScan = extractTableIdFromScanPath(inst?.router?.params?.scene);
    const tid = tidFromIndex || tidFromScan;
    if (!tid) {
      router.toIndex();
      await Taro.showToast({ title: "未能成功获取桌台信息", icon: "none" });
      return;
    }
    setTableId(String(tid));
  });

  const resizeHandlerRef = useRef(() => {
    measureHeaderHeightRef.current();
    measureSectionTopsRef.current();
  });

  useDidShow(() => {
    const v = getUserProfileVer();
    if (v && v !== lastProfileVer) {
      setLastProfileVer(v);
      if (tableId) {
        useTableSessionStore.getState().init(tableId);
      }
    }
    useTableSessionStore.getState().probeConnection();
    void tryRestoreResumeContext();
    measureSectionTopsRef.current();
    Taro.onWindowResize(resizeHandlerRef.current);
  });

  useDidHide(() => {
    Taro.offWindowResize(resizeHandlerRef.current);
  });

  useEffect(() => {
    if (!tableId) return;
    let stopped = false;
    void (async () => {
      try {
        await ensureLogin();
        const t = await getTable(tableId);
        if (stopped) return;
        if (t.wasFree === false && t.status === "OCCUPIED") {
          const connCount = Number(t.connCount || 0) || 0;
          const activeOrderCount = Number(t.activeOrderCount || 0) || 0;
          const tableCode = t.code ? ` ${t.code}` : "";
          if (connCount > 0) {
            const r = await Taro.showModal({
              title: `桌台 ${tableCode} 正在使用`,
              content: `检测到当前桌台已有 ${connCount} 位用户在线点餐。继续入桌后你将加入同桌会话并看到当前购物车，是否继续？`,
              confirmText: "继续入桌",
              cancelText: "返回首页",
            });
            if (stopped) return;
            if (!r.confirm) {
              router.toIndex();
              return;
            }
          } else if (activeOrderCount <= 0) {
            const r = await Taro.showModal({
              title: `桌台 ${tableCode} 已占用`,
              content: "当前桌台暂时无人在线，且没有进行中订单。你可以直接入桌，或重置桌台开始新的会话。",
              confirmText: "继续入桌",
              cancelText: "重置桌台",
            });
            if (stopped) return;
            if (!r.confirm) {
              const r2 = await Taro.showModal({
                title: "确认重置桌台？",
                content: "重置后将开始新的桌台会话，原会话的购物车将被清空。请确认是否继续。",
                confirmText: "确认重置",
                cancelText: "继续入桌",
              });
              if (stopped) return;
              if (r2.confirm) {
                try {
                  await resetTableSession(tableId);
                  await Taro.showToast({ title: "桌台已重置", icon: "none" });
                } catch (e) {
                  await Taro.showToast({
                    title: e instanceof Error ? e.message : "重置失败",
                    icon: "none",
                  });
                  return;
                }
              }
            }
          } else {
            const r = await Taro.showModal({
              title: `桌台 ${tableCode} 已占用`,
              content: "当前桌台暂时无人在线，但存在进行中订单。继续入桌后你可以查看本次会话订单，是否继续？",
              confirmText: "继续入桌",
              cancelText: "返回首页",
            });
            if (stopped) return;
            if (!r.confirm) {
              router.toIndex();
              return;
            }
          }
        }
        await acquire(tableId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "初始化失败";
        if (msg === "桌台不存在") router.toIndex();
        await Taro.showToast({ title: msg, icon: "none" });
      }
    })();
    return () => {
      stopped = true;
      release();
    };
  }, [acquire, release, router, tableId]);

  useEffect(() => {
    if (!sessionClosedAt) return;
    void (async () => {
      await Taro.showModal({
        title: "提示",
        content: sessionClosedMessage || "桌台已关闭",
        showCancel: false,
        confirmText: "返回首页",
      });
      disconnect();
      router.toIndex();
    })();
  }, [disconnect, router, sessionClosedAt, sessionClosedMessage]);

  useEffect(() => {
    if (!storeIdFromTable) return;
    if (storeFromTable) {
      setStore(storeFromTable);
      setRecentStore(storeFromTable);
    }
    void (async () => {
      try {
        const r = await getCategories({
          storeId: storeIdFromTable,
          status: "ACTIVE",
          page: 1,
          pageSize: 200,
        });
        const list = (r.list || []).slice().sort((a, b) => (b.sort || 0) - (a.sort || 0));
        setCategories(list);
        if (!activeCategoryIdRef.current && list.length) {
          setActiveCategoryId(list[0].categoryId);
          activeCategoryIdRef.current = list[0].categoryId;
        }
      } catch (e) {
        await Taro.showToast({ title: e instanceof Error ? e.message : "加载分类失败", icon: "none" });
      }
    })();
  }, [storeFromTable, storeIdFromTable]);

  const measureHeaderHeightRef = useRef<() => void>(() => {});
  measureHeaderHeightRef.current = () => {
    Taro.nextTick(() => {
      const q = Taro.createSelectorQuery();
      q.select("#om-header").boundingClientRect();
      q.exec((res) => {
        const rect = res?.[0] as any;
        const h = Math.ceil(Number(rect?.height || 0));
        if (h > 0) setHeaderHeightPx(h);
      });
    });
  };

  useEffect(() => {
    measureHeaderHeightRef.current();
  }, [table?.code]);

  useEffect(() => {
    const handler = resizeHandlerRef.current;
    return () => {
      Taro.offWindowResize(handler);
    };
  }, []);

  useEffect(() => {
    if (!storeIdFromTable) return;
    const seq = (goodsReqSeqRef.current += 1);
    void (async () => {
      setLoadingGoods(true);
      try {
        const pageSize = 200;
        const all: GoodListItemDTO[] = [];
        let page = 1;
        let total = 0;
        while (true) {
          const r = await getGoods({
            storeId: storeIdFromTable || undefined,
            status: "ON_SHELF",
            name: keyword.trim() || undefined,
            page,
            pageSize,
          });
          if (seq !== goodsReqSeqRef.current) return;
          const list = r.list || [];
          total = r.pagination?.total || 0;
          all.push(...list);
          if (!total || all.length >= total || list.length === 0) break;
          page += 1;
          if (page > 50) break;
        }
        if (seq !== goodsReqSeqRef.current) return;
        setGoods(all);
      } catch (e) {
        if (seq !== goodsReqSeqRef.current) return;
        await Taro.showToast({ title: e instanceof Error ? e.message : "加载菜品失败", icon: "none" });
      } finally {
        if (seq !== goodsReqSeqRef.current) return;
        setLoadingGoods(false);
      }
    })();
  }, [keyword, storeIdFromTable]);

  const grouped = useMemo(() => {
    const map = new Map<string, GoodListItemDTO[]>();
    for (const g of goods) {
      const ids =
        Array.isArray(g.categoryIds) && g.categoryIds.length ? Array.from(new Set(g.categoryIds)) : [g.categoryId];
      for (const cid of ids) {
        if (!cid) continue;
        const arr = map.get(cid) || [];
        arr.push(g);
        map.set(cid, arr);
      }
    }
    const base = categories.map((c) => ({
      category: c,
      goods: (map.get(c.categoryId) || []).slice().sort((a, b) => {
        const soa = a.soldOut ? 1 : 0;
        const sob = b.soldOut ? 1 : 0;
        if (soa !== sob) return soa - sob;
        const sa = Number(a.categorySortById?.[c.categoryId] || 0) || 0;
        const sb = Number(b.categorySortById?.[c.categoryId] || 0) || 0;
        if (sa !== sb) return sb - sa;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return String(a.goodId).localeCompare(String(b.goodId));
      }),
    }));
    return base.filter((x) => (x.goods || []).length);
  }, [categories, goods]);

  const measureSectionTopsRef = useRef<() => void>(() => {});
  measureSectionTopsRef.current = () => {
    setTimeout(() => {
      Taro.nextTick(() => {
        const q = Taro.createSelectorQuery();
        q.select(".goods-scroll").boundingClientRect();
        q.select(".goods-scroll").scrollOffset();
        q.selectAll(".cat-section").boundingClientRect();
        q.exec((res) => {
          const container = res?.[0] as any;
          const offset = res?.[1] as any;
          const sections = (res?.[2] as any[]) || [];
          if (!sections.length) return;
          const scrollTop = Number(offset?.scrollTop ?? goodsScrollTopRef.current ?? 0) || 0;
          goodsScrollTopRef.current = scrollTop;
          const containerTop = Number(container?.top || 0);
          const next: Array<{ categoryId: string; top: number }> = [];
          for (const s of sections) {
            const id = String(s?.id || "");
            if (!id.startsWith("cat-")) continue;
            const categoryId = id.slice("cat-".length);
            const top = Number(s?.top || 0) - containerTop + scrollTop;
            next.push({ categoryId, top });
          }
          next.sort((a, b) => a.top - b.top);
          if (!next.length) return;
          sectionTopsRef.current = next;
          const validIds = new Set(next.map((x) => x.categoryId));
          const cur = activeCategoryIdRef.current;
          if (cur && !validIds.has(cur)) {
            const first = next[0]?.categoryId || "";
            activeCategoryIdRef.current = first;
            setActiveCategoryId(first);
            if (first) applyMenuScrollIntoView(first);
          } else {
            syncActiveCategoryByScrollTop(scrollTop);
          }
        });
      });
    }, 0);
  };

  useEffect(() => {
    if (!grouped.length) return;
    measureSectionTopsRef.current();
  }, [grouped]);

  const cartQty = useMemo(() => {
    const items = cart?.items || [];
    return items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  }, [cart?.items]);

  const cartTotalCents = useMemo(() => {
    const items = cart?.items || [];
    return items.reduce((s, it) => s + (Number(it.unitPriceSnapshot || 0) || 0) * (Number(it.qty) || 0), 0);
  }, [cart?.items]);

  const openGood = async (goodId: string) => {
    setGoodOpen(true);
    setSkuOpen(false);
    setActiveGood(null);
    setLoadingGood(true);
    try {
      const sid = String((table as any)?.storeId || "");
      const d = await getGood(goodId, { storeId: sid || undefined });
      setActiveGood(d);
      const initSel: Record<string, string[]> = {};
      for (const g of d.optionGroups || []) {
        const max = Number(g.maxSelection || 0) || 0;
        if (max <= 0) continue;
        const optionIdSet = new Set((g.options || []).map((o) => o.id));
        const raw = Array.isArray(g.defaultOptionIds) ? g.defaultOptionIds : [];
        const uniq = Array.from(new Set(raw.map((x) => String(x || "")).filter((x) => x)));
        const picked = uniq.filter((id) => optionIdSet.has(id)).slice(0, max);
        if (picked.length) initSel[g.id] = picked;
      }
      setSelectedOptionIdsByGroupId(initSel);
      setInvalidGroupId("");
    } catch (e) {
      await Taro.showToast({ title: e instanceof Error ? e.message : "加载详情失败", icon: "none" });
      setGoodOpen(false);
    } finally {
      setLoadingGood(false);
    }
  };

  const stockGroups = useMemo(() => {
    if (!activeGood) return [];
    return (activeGood.optionGroups || []).filter((g) => g.isStock !== false);
  }, [activeGood]);
  const nonStockGroups = useMemo(() => {
    if (!activeGood) return [];
    return (activeGood.optionGroups || []).filter((g) => g.isStock === false);
  }, [activeGood]);

  const inStockCombos = useMemo(() => {
    if (!activeGood) return [];
    return (activeGood.skus || [])
      .filter((s) => s.status === "ON_SHELF" && (s.stock || 0) > 0)
      .map((s) => parseSpecCombinationToOptionIdsByGroupId(stockGroups, s.specCombination));
  }, [activeGood, stockGroups]);

  const selectedSku = useMemo(() => {
    if (!activeGood) return null;
    const specText = buildSpecText(stockGroups, selectedOptionIdsByGroupId);
    return activeGood.skus.find((s) => s.specCombination === specText) || null;
  }, [activeGood, selectedOptionIdsByGroupId, stockGroups]);

  const selectedNonStockAddCents = useMemo(() => {
    if (!activeGood) return 0;
    let sum = 0;
    for (const g of nonStockGroups) {
      const picked = selectedOptionIdsByGroupId[g.id] || [];
      for (const id of picked) {
        const o = g.options.find((x) => x.id === id);
        if (o && o.priceCents > 0) sum += o.priceCents;
      }
    }
    return sum;
  }, [activeGood, nonStockGroups, selectedOptionIdsByGroupId]);

  const selectedPiUnitPriceCents = useMemo(() => {
    if (!selectedSku) return 0;
    return (Number(selectedSku.priceCents || 0) || 0) + selectedNonStockAddCents;
  }, [selectedNonStockAddCents, selectedSku]);

  const selectedSkuAvailable = Boolean(
    selectedSku && selectedSku.status === "ON_SHELF" && (selectedSku.stock || 0) > 0,
  );

  const selectedSkuInCartQty = useMemo(() => {
    if (!selectedSku) return 0;
    const items = cart?.items || [];
    let sum = 0;
    for (const it of items) if (it.skuId === selectedSku.skuId) sum += Number(it?.qty || 0) || 0;
    return sum;
  }, [cart?.items, selectedSku]);

  const maxAddQty = useMemo(() => {
    if (!selectedSku || selectedSku.status !== "ON_SHELF") return 0;
    const stock = Number(selectedSku.stock || 0) || 0;
    return Math.max(0, stock - selectedSkuInCartQty);
  }, [selectedSku, selectedSkuInCartQty]);

  const handleAddToCart = async () => {
    if (!selectedSku) return;
    if (!selectedSkuAvailable || !maxAddQty || qty > maxAddQty) {
      await Taro.showToast({ title: "库存不足", icon: "none" });
      return;
    }
    const vr = validateNonStockSelections(nonStockGroups, selectedOptionIdsByGroupId);
    if (!vr.ok) {
      setInvalidGroupId(vr.groupId);
      await Taro.showToast({ title: vr.message, icon: "none" });
      return;
    }
    try {
      await ensureLogin();
    } catch {
      void 0;
    }
    const u = getUser();
    if (!u?.nickname || !u?.avatarUrl) {
      const r = await Taro.showModal({
        title: "完善个人信息",
        content: "建议先设置头像和昵称，方便同桌识别。是否现在去设置？",
        confirmText: "去设置",
        cancelText: "继续匿名",
      });
      if (r.confirm) {
        saveResumeContext();
        setSkuOpen(false);
        setGoodOpen(false);
        setQty(1);
        router.toProfileEdit();
        return;
      }
    }
    const nonStockSelectionsByGroupId: Record<string, string[]> = {};
    for (const g of nonStockGroups) {
      const ids = selectedOptionIdsByGroupId[g.id] || [];
      if (ids.length) nonStockSelectionsByGroupId[g.id] = ids;
    }
    const ok = await runCartOp(() => addItem(selectedSku.skuId, qty, nonStockSelectionsByGroupId), {
      successTitle: "已加入购物车",
    });
    if (!ok) return;
    setSkuOpen(false);
    setGoodOpen(false);
    setQty(1);
  };

  return (
    <View
      className='page-order-meal'
      style={headerHeightPx ? ({ "--header-height": `${headerHeightPx}px` } as any) : undefined}
    >
      <View id='om-header' className='header'>
        <View className='top'>
          <View className='top-left'>
            <View className='store-row'>
              <View
                className='store-logo'
                style={store?.logoUrl ? ({ backgroundImage: `url(${store.logoUrl})` } as any) : undefined}
              >
                {!store?.logoUrl ? <View className='store-logo-text'>店</View> : null}
              </View>
              <View className='store-name'>{getStoreDisplayName(store) || "点餐"}</View>
            </View>
            {table?.code ? <View className='table-code'>{`${table.code} 桌`}</View> : null}
          </View>
          <Button className='top-btn' onClick={() => (tableId ? router.toTableOrders({ tableId }) : null)}>
            <View className='top-btn-inner'>
              <View className='top-btn-icon'>📋</View>
              <View>本桌订单</View>
            </View>
          </Button>
        </View>

        <View className='search-bar'>
          <Input
            className='search-input'
            placeholder='搜索菜品名称'
            value={keyword}
            onInput={(e) => setKeyword(String(e.detail.value || ""))}
          />
        </View>

        {lastError ? <View className='error'>错误：{lastError}</View> : null}
      </View>

      <View className='contents'>
        <ScrollView
          className='cat-menu'
          scrollY
          enhanced
          scrollWithAnimation
          scrollIntoView={menuScrollIntoView || undefined}
          scrollIntoViewAlignment='start'
          showScrollbar={false}
        >
          {grouped.map(({ category: c }) => {
            const active = activeCategoryId === c.categoryId;
            return (
              <View
                key={c.categoryId}
                id={`menu-${c.categoryId}`}
                className={`cat-menu-item ${active ? "cat-menu-item-active" : ""}`}
                onClick={() => {
                  const target = `cat-${c.categoryId}`;
                  activeCategoryIdRef.current = c.categoryId;
                  setActiveCategoryId(c.categoryId);
                  if (menuScrollTimerRef.current) clearTimeout(menuScrollTimerRef.current);
                  applyMenuScrollIntoView(c.categoryId);
                  setScrollIntoView("");
                  setTimeout(() => setScrollIntoView(target), 0);
                }}
              >
                <View className='cat-menu-item-name'>{c.name}</View>
                {c.badgeText ? <View className='cat-menu-item-badge'>{c.badgeText}</View> : null}
              </View>
            );
          })}
          <View className='cat-menu-item-bottom' />
        </ScrollView>

        <ScrollView
          className='goods-scroll'
          scrollY
          enhanced
          scrollWithAnimation
          scrollIntoView={scrollIntoView || undefined}
          showScrollbar={false}
          onScroll={(e) => {
            const top = Number((e as any)?.detail?.scrollTop || 0);
            syncActiveCategoryByScrollTop(top);
          }}
          onTouchStart={() => stopGoodsScrollEndPoll()}
          onTouchCancel={() => startGoodsScrollEndPoll()}
          onTouchEnd={() => startGoodsScrollEndPoll()}
        >
          <View className='goods-content'>
            {loadingGoods ? <View className='goods-hint'>加载中...</View> : null}
            {!loadingGoods && !goods.length ? <View className='goods-hint'>暂无菜品</View> : null}
            {grouped.map(({ category, goods: goodsInCat }) => (
              <View key={category.categoryId} id={`cat-${category.categoryId}`} className='cat-section'>
                <View className='section-title'>
                  <View className='section-title-name'>{category.name}</View>
                  {category.subtitle ? <View className='section-title-subtitle'>{category.subtitle}</View> : null}
                </View>
                <View className='section-list'>
                  {goodsInCat.map((g) => (
                    <GoodItem key={g.goodId} good={g} onClick={() => void openGood(g.goodId)} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <View className='cart-bar' onClick={() => setCartOpen(true)}>
        <View className='cart-left'>
          <Image
            className='cart-icon'
            src='https://static.bitego.net/images/stores/20260317/4b40b0d0-aa85-4fb2-a230-192584add353.png'
            mode='aspectFit'
          />
          <View className='cart-meta'>
            <View className='cart-qty'>已选 {cartQty}</View>
            <View className='cart-total'>{formatCents(cartTotalCents)}</View>
          </View>
        </View>
        <View className='cart-btn'>去结算</View>
      </View>

      <GoodDetailSheet
        open={goodOpen}
        activeGood={activeGood}
        loading={loadingGood}
        onClose={() => {
          setGoodOpen(false);
          setSkuOpen(false);
          setQty(1);
        }}
        onChooseSku={() => setSkuOpen(true)}
      />

      <SkuPickerSheet
        open={skuOpen}
        activeGood={activeGood}
        selectedOptionIdsByGroupId={selectedOptionIdsByGroupId}
        onSelectedOptionIdsChange={setSelectedOptionIdsByGroupId}
        invalidGroupId={invalidGroupId}
        onInvalidGroupIdChange={setInvalidGroupId}
        qty={qty}
        onQtyChange={setQty}
        selectedSku={selectedSku}
        selectedSkuAvailable={selectedSkuAvailable}
        maxAddQty={maxAddQty}
        selectedPiUnitPriceCents={selectedPiUnitPriceCents}
        stockGroups={stockGroups}
        nonStockGroups={nonStockGroups}
        inStockCombos={inStockCombos}
        onClose={() => {
          setSkuOpen(false);
          setQty(1);
          setInvalidGroupId("");
        }}
        onConfirm={handleAddToCart}
      />

      <CartSheet
        open={cartOpen}
        items={cart?.items || []}
        totalCents={cartTotalCents}
        qty={cartQty}
        onSub={(it) => void runCartOp(() => updateQty(it.cartItemId, Math.max(0, it.qty - 1)))}
        onAdd={(it) => void runCartOp(() => updateQty(it.cartItemId, it.qty + 1))}
        onRemove={(it) => void runCartOp(() => removeItem(it.cartItemId))}
        onCheckout={() => {
          setCartOpen(false);
          router.toCheckout({ tableId });
        }}
        onClose={() => setCartOpen(false)}
      />

      <GlobalToast />
    </View>
  );
}
