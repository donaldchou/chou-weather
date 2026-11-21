import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "上巴陵天氣資料",
  description: "拉拉山上巴陵 2010 年起逐時天氣與水蜜桃農事指標",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full" style={{ fontFamily: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
