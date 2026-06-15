import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "電氣法規 AI 助理",
  description: "台灣電氣法規查詢助理，支援用電裝置規則、建築技術規則、消防法規",
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
