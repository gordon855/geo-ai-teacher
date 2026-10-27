import type { Metadata } from "next";
import SiteLegalFooter from "@/components/site-legal-footer";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./v21-design.css";
import Atmosphere from "@/components/workstations/motion";

// The ICP and public-security record numbers are supplied when the ECS container
// starts, after the image has been built. Keep the layout dynamic so the footer
// always reads the current approved values instead of freezing build-time blanks.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GeoAI Teacher 21.7 | 测绘专业外语",
  description: "GeoAI Teacher 21.7 原创演示版：专业外语学习、课堂互动与练习评价。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Atmosphere />
        {children}
        <SiteLegalFooter />
      </body>
    </html>
  );
}
