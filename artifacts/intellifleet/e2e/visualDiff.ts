// TEST-ONLY pixel comparison without extra npm packages: both PNGs are decoded inside headless Chromium (data URL ->
// <img> -> canvas -> getImageData), aligned, masked and compared per channel. Returns the % of differing pixels plus a
// diff image (differences in red over a faded design) and a side-by-side composite (design | app).
import type { Browser } from "playwright";

export interface Rect { x: number; y: number; w: number; h: number }
export interface DiffResult { percent: number; compared: number; differing: number; width: number; height: number; diff: Buffer; composite: Buffer }

export interface DiffOptions {
  /** Region of the design PNG (device pixels) that corresponds to the captured app element. */
  crop: Rect;
  /** Masked regions in output (cropped design) pixel space: excluded from the count. */
  masks?: Rect[];
  /** Per-channel tolerance (0-255). A pixel differs when any channel differs by more than this. */
  tolerance?: number;
  /** Background used to pad the app image when it is shorter than the design region. */
  pad?: string;
  /** Scale the app image so its width equals the crop width (when the captured width differs). */
  fitWidth?: boolean;
}

export async function visualDiff(browser: Browser, design: Buffer, app: Buffer, opts: DiffOptions): Promise<DiffResult> {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  try {
    const out = await page.evaluate(async ({ designUrl, appUrl, crop, masks, tolerance, pad, fitWidth }) => {
      const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("decode failed")); i.src = src; });
      const [d, a] = await Promise.all([load(designUrl), load(appUrl)]);
      const w = crop.w, h = crop.h;
      const canvas = (cw: number, ch: number) => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };
      const dc = canvas(w, h), dx = dc.getContext("2d")!;
      dx.drawImage(d, crop.x, crop.y, w, h, 0, 0, w, h);
      const ac = canvas(w, h), ax = ac.getContext("2d")!;
      ax.fillStyle = pad; ax.fillRect(0, 0, w, h);
      const scale = fitWidth ? w / a.width : 1;
      ax.imageSmoothingQuality = "high";
      ax.drawImage(a, 0, 0, a.width * scale, a.height * scale);
      const dd = dx.getImageData(0, 0, w, h).data, ad = ax.getImageData(0, 0, w, h).data;
      const mask = new Uint8Array(w * h);
      for (const m of masks) for (let y = Math.max(0, m.y); y < Math.min(h, m.y + m.h); y++) mask.fill(1, y * w + Math.max(0, m.x), y * w + Math.min(w, m.x + m.w));
      const oc = canvas(w, h), ox = oc.getContext("2d")!;
      const outImg = ox.createImageData(w, h), o = outImg.data;
      let compared = 0, differing = 0;
      for (let p = 0, i = 0; p < w * h; p++, i += 4) {
        const grey = Math.round((dd[i] + dd[i + 1] + dd[i + 2]) / 3);
        const faded = 255 - Math.round((255 - grey) * 0.25);
        if (mask[p]) { o[i] = o[i + 1] = 200; o[i + 2] = 230; o[i + 3] = 255; continue; } // masked = pale blue
        compared++;
        const diff = Math.abs(dd[i] - ad[i]) > tolerance || Math.abs(dd[i + 1] - ad[i + 1]) > tolerance || Math.abs(dd[i + 2] - ad[i + 2]) > tolerance;
        if (diff) { differing++; o[i] = 230; o[i + 1] = 0; o[i + 2] = 0; } else { o[i] = o[i + 1] = o[i + 2] = faded; }
        o[i + 3] = 255;
      }
      ox.putImageData(outImg, 0, 0);
      const gap = 24;
      const cc = canvas(w * 2 + gap, h), cx = cc.getContext("2d")!;
      cx.fillStyle = "white"; cx.fillRect(0, 0, cc.width, h);
      cx.drawImage(dc, 0, 0); cx.drawImage(ac, w + gap, 0);
      return { compared, differing, w, h, diff: oc.toDataURL("image/png"), composite: cc.toDataURL("image/png") };
    }, {
      designUrl: `data:image/png;base64,${design.toString("base64")}`, appUrl: `data:image/png;base64,${app.toString("base64")}`,
      crop: opts.crop, masks: opts.masks ?? [], tolerance: opts.tolerance ?? 40, pad: opts.pad ?? "white", fitWidth: !!opts.fitWidth,
    });
    const png = (url: string) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    return { percent: out.compared ? (100 * out.differing) / out.compared : 0, compared: out.compared, differing: out.differing, width: out.w, height: out.h, diff: png(out.diff), composite: png(out.composite) };
  } finally {
    await context.close();
  }
}
