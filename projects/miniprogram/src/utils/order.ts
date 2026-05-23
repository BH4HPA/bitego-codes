export function orderStatusText(status: string | null | undefined) {
  const s = String(status || "");
  if (!s) return "";
  if (s === "Created") return "已创建";
  if (s === "Paid") return "已支付";
  if (s === "Making") return "制作中";
  if (s === "Completed") return "已完成";
  if (s === "Canceled") return "已取消";
  if (s === "Refunding") return "退款中";
  if (s === "Refunded") return "已退款";
  return s;
}
