import { Text } from "@tarojs/components";
import { formatCents } from "../../utils/money";

export function Price(props: { cents: number; className?: string }) {
  return <Text className={props.className}>{formatCents(props.cents)}</Text>;
}
