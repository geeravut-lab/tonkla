import { NextResponse, type NextRequest } from "next/server";
import { getBrand } from "@/server/brand";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

export const dynamic = "force-dynamic";

// Public (the login page needs the logo) but served by us from a private bucket. Default files live in /brand/default.
const DEFAULTS: Record<string, string> = {
  logo: "tonkla-mark.svg",
  favicon: "favicon.svg",
  "favicon-32": "favicon-32.png",
  "apple-icon": "apple-touch-icon.png",
  "icon-192": "icon-192.png",
  "icon-512": "icon-512.png",
  "icon-maskable": "icon-maskable-512.png",
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const fallback = DEFAULTS[name];
  if (!fallback) return new NextResponse("Not found", { status: 404 });
  const redirectDefault = () => {
    const res = NextResponse.redirect(new URL(`/brand/default/${fallback}`, request.url));
    res.headers.set("Cache-Control", "public, max-age=300");
    return res;
  };
  try {
    const brand = await getBrand();
    const asset: { path: string; version: number; mime?: string } | undefined = name === "logo" ? brand.logo : name === "icon-maskable" ? undefined : brand.icon;
    if (!asset) return redirectDefault();
    const dl = await supabaseAdmin().storage.from("brand").download(asset.path);
    if (dl.error || !dl.data) throw dl.error ?? new Error("missing object");
    const bytes = await dl.data.arrayBuffer();
    const mime = "mime" in asset ? String(asset.mime) : "image/png";
    const versioned = request.nextUrl.searchParams.has("v");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": mime,
        // a new upload = a new version in the URL, so versioned URLs can be cached for good
        "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
        ETag: `"${asset.version}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("brand asset failed", name, (e as Error).message);
    return redirectDefault();
  }
}
