import { Button, Image, Swiper, SwiperItem, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { GoodDetailDTO } from "../../api/types";
import { BottomSheet } from "../../components/common/BottomSheet";
import { MarkdownView } from "../../components/common/MarkdownView";
import { formatCents } from "../../utils/money";

type Props = {
  open: boolean;
  activeGood: GoodDetailDTO | null;
  loading: boolean;
  onClose: () => void;
  onChooseSku: () => void;
};

export function GoodDetailSheet(props: Props) {
  const { activeGood } = props;
  return (
    <BottomSheet
      open={props.open}
      title={
        <View className='sheet-title'>
          <View className='good-name'>{activeGood?.name || "菜品详情"}</View>
          {activeGood && <View className='good-price'>{formatCents(activeGood.minPriceCents)} 起</View>}
        </View>
      }
      onClose={props.onClose}
      height='70vh'
      footer={
        activeGood ? (
          <Button className='sheet-btn' onClick={props.onChooseSku}>
            选购
          </Button>
        ) : null
      }
    >
      {props.loading ? <View className='sheet-hint'>加载中...</View> : null}
      {activeGood ? (
        <View>
          {activeGood.imageUrls?.length ? (
            <Swiper className='good-swiper' circular indicatorDots autoplay={false}>
              {activeGood.imageUrls.filter(Boolean).map((url) => (
                <SwiperItem key={url}>
                  <Image
                    className='good-image'
                    src={url}
                    mode='aspectFill'
                    onClick={() => {
                      const urls = activeGood.imageUrls.filter(Boolean);
                      void Taro.previewImage({ current: url, urls });
                    }}
                  />
                </SwiperItem>
              ))}
            </Swiper>
          ) : null}
          {activeGood.description ? <View className='sheet-summary'>{activeGood.description}</View> : null}
          {activeGood.detailMarkdown ? (
            <MarkdownView className='sheet-detail' markdown={activeGood.detailMarkdown} />
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}
