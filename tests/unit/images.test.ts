import { describe, expect, it } from "vitest";
import { pngSize, sniffImage } from "@/server/images";

const png = (w: number, h: number) => {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};

describe("image sniffing", () => {
  it("recognises PNG, JPEG and WebP by their bytes", () => {
    expect(sniffImage(png(512, 512))).toBe("png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpeg");
    const webp = new Uint8Array(16);
    webp.set([...Buffer.from("RIFF")], 0);
    webp.set([...Buffer.from("WEBP")], 8);
    expect(sniffImage(webp)).toBe("webp");
  });
  it("rejects SVG, HTML and anything else even if renamed .png", () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
  it("reads PNG dimensions", () => {
    expect(pngSize(png(192, 192))).toEqual({ w: 192, h: 192 });
  });
});
