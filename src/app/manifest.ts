import type { MetadataRoute } from "next";
import { BACKGROUND_COLOR, THEME_COLOR } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tonkla · ต้นกล้า",
    short_name: "Tonkla",
    start_url: "/",
    display: "standalone",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
