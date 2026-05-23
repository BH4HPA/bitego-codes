export function labelGoodStatus(status: string) {
  if (status === 'ON_SHELF') return '上架';
  if (status === 'OFF_SHELF') return '下架';
  return status;
}

export function labelOrderStatus(status: string) {
  if (status === 'Paid') return '已支付';
  if (status === 'Making') return '制作中';
  if (status === 'Completed') return '已完成';
  if (status === 'Canceled') return '已取消';
  if (status === 'Refunding') return '退款中';
  if (status === 'Refunded') return '已退款';
  if (status === 'Created') return '已创建';
  return status;
}

export function labelTableStatus(status: string) {
  if (status === 'FREE') return '空闲';
  if (status === 'OCCUPIED') return '占用';
  return status;
}

export function labelSkuStatus(status: string) {
  if (status === 'ON_SHELF') return '上架';
  if (status === 'OFF_SHELF') return '下架';
  return status;
}
