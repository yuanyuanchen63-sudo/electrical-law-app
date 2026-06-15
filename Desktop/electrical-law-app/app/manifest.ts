export default function manifest() {
  return {
    name: "機電智庫 AI",
    short_name: "機電智庫",
    description: "機電法規與工程知識查詢平台",

    start_url: "/",
    display: "standalone",

    background_color: "#0B1220",
    theme_color: "#0B1220",

    icons: [
  {
    src: "/icon-192.png",
    sizes: "192x192",
    type: "image/png"
  },
  {
    src: "/icon-512.png",
    sizes: "512x512",
    type: "image/png"
      }
    ]
  };
}
