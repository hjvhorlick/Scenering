import { createHarness } from "./harness";
import { getWatermarkLayout } from "../src/lib/watermark-layout";

const h = createHarness();
const logoWidth = 1200;
const logoHeight = 300;

const hd = getWatermarkLayout(1280, 720, logoWidth, logoHeight);
h.eq(hd.width, 360, "default watermark is exactly twice the former 180px reference width");
h.eq(hd.x, 96, "landscape watermark uses twice the previous left safe-area inset");
h.eq(hd.y, 20, "top placement stays familiar");
h.eq(hd.height, 90, "logo aspect ratio is preserved");

const phone = getWatermarkLayout(1080, 1920, logoWidth, logoHeight);
h.eq(phone.width, 304, "portrait output scales watermark from canvas width");
h.eq(phone.x, 81, "portrait output receives the doubled responsive left safe area");
h.ok(phone.x > 0 && phone.x + phone.width < 1080, "portrait watermark is fully inside the frame");
h.ok(phone.y >= 10 && phone.y + phone.height < 1920, "portrait watermark is vertically inside the frame");

const tiny = getWatermarkLayout(320, 568, logoWidth, logoHeight);
h.ok(tiny.x >= 12, "small phone preview never hugs the left edge");
h.ok(tiny.x + tiny.width <= 320 - tiny.x, "small phone preview preserves both horizontal safe areas");
h.ok(tiny.width >= 40, "small preview remains legible");

const doubledSetting = getWatermarkLayout(1280, 720, logoWidth, logoHeight, 2);
h.eq(doubledSetting.width, 720, "explicit scale still works from the new larger default");
const invalidSetting = getWatermarkLayout(1280, 720, logoWidth, logoHeight, Number.NaN);
h.eq(invalidSetting.width, 360, "invalid scale safely falls back to the default");

for (const value of Object.values(phone)) h.finite(value, "phone layout contains only finite numbers");

h.done("watermark-layout");
