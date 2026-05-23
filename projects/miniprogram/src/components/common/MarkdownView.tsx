import { RichText, View } from "@tarojs/components";
import { marked } from "marked";
import { useMemo } from "react";
import "./MarkdownView.scss";

function sanitizeHtml(html: string) {
  let out = String(html || "");
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, "");
  out = out.replace(/javascript:/gi, "");
  return out;
}

export function MarkdownView(props: { markdown?: string; className?: string }) {
  const html = useMemo(() => {
    marked.setOptions({ breaks: true });
    const raw = marked.parse(props.markdown || "") as string;
    return sanitizeHtml(raw);
  }, [props.markdown]);

  return (
    <View className={props.className}>
      <RichText className='md-root' nodes={html} />
    </View>
  );
}
