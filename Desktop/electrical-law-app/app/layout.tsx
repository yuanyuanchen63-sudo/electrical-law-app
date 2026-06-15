import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "機電智庫 AI",
  description: "整合機電設計、電氣法規、建築技術規則、消防法規與工程知識的智慧查詢平台",
  
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
