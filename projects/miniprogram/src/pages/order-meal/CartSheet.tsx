import { Button, View } from "@tarojs/components";
import { BottomSheet } from "../../components/common/BottomSheet";
import type { TableCartItem } from "../../store/tableSessionStore";
import { formatCents } from "../../utils/money";

type Props = {
  open: boolean;
  items: TableCartItem[];
  totalCents: number;
  qty: number;
  onSub: (item: TableCartItem) => void;
  onAdd: (item: TableCartItem) => void;
  onRemove: (item: TableCartItem) => void;
  onCheckout: () => void;
  onClose: () => void;
};

export function CartSheet(props: Props) {
  return (
    <BottomSheet
      open={props.open}
      title='购物车'
      onClose={props.onClose}
      height='70vh'
      footer={
        <View className='cart-footer'>
          <View className='cart-footer-total'>合计：{formatCents(props.totalCents)}</View>
          <Button className='sheet-btn' disabled={!props.qty} onClick={props.onCheckout}>
            去提单
          </Button>
        </View>
      }
    >
      <View className='cart-items'>
        {props.items.length ? (
          props.items.map((it) => (
            <View key={it.cartItemId} className='cart-row'>
              <View className='cart-row-main'>
                <View className='cart-row-name'>{it.goodNameSnapshot}</View>
                <View className='cart-row-spec'>{it.specTextSnapshot}</View>
                <View className='cart-row-by'>
                  <View
                    className='by-avatar'
                    style={
                      it.addedByAvatarSnapshot ? { backgroundImage: `url(${it.addedByAvatarSnapshot})` } : undefined
                    }
                  >
                    {!it.addedByAvatarSnapshot ? <View className='by-avatar-text'>匿</View> : null}
                  </View>
                  <View className='by-name'>{it.addedByNicknameSnapshot || "匿名"}</View>
                </View>
                <View className='cart-row-price'>{formatCents(Number(it.unitPriceSnapshot || 0))}</View>
              </View>
              <View className='cart-row-ops'>
                <Button className='qty-btn' onClick={() => props.onSub(it)}>
                  -
                </Button>
                <View className='qty-val'>{it.qty}</View>
                <Button className='qty-btn' onClick={() => props.onAdd(it)}>
                  +
                </Button>
                <Button className='remove-btn' onClick={() => props.onRemove(it)}>
                  删除
                </Button>
              </View>
            </View>
          ))
        ) : (
          <View className='sheet-hint'>购物车为空</View>
        )}
      </View>
    </BottomSheet>
  );
}
