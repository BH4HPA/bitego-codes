import { Image, View } from "@tarojs/components";
import type { GoodListItemDTO } from "../../api/types";
import { Price } from "../common/Price";
import "./GoodItem.scss";

export function GoodItem(props: { good: GoodListItemDTO; onClick: () => void }) {
  const g = props.good;
  const soldOut = Boolean(g.soldOut);
  // @ts-ignore
  const imgExtraProps = process.env.TARO_ENV === "weapp" && process.env.NODE_ENV !== "test" ? { lazyLoad: true } : {};
  return (
    <View
      className={`gi-root ${soldOut ? "gi-root-sold-out" : ""}`}
      onClick={() => {
        if (soldOut) return;
        props.onClick();
      }}
    >
      <Image className='gi-img' src={g.imageUrls?.[0] || ""} mode='aspectFill' {...imgExtraProps} />
      <View className='gi-main'>
        <View className='gi-name-row'>
          <View className='gi-name'>{g.name}</View>
          {soldOut ? <View className='gi-tag'>已售罄</View> : null}
        </View>
        {!soldOut && g.description ? <View className='gi-desc'>{g.description}</View> : null}
        <View className='gi-bottom'>
          <Price cents={g.minPriceCents} className='gi-price' />
          <View className='gi-sold'>已售 {g.sales || 0}</View>
        </View>
      </View>
    </View>
  );
}
