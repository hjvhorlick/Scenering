import { useMemo } from "react";
import FilterPreviewCanvas from "../../components/FilterPreviewCanvas";
import StickerPreviewCanvas from "../../components/StickerPreviewCanvas";
import TemplatePreviewCanvas from "../../components/TemplatePreviewCanvas";
import CtaOptionThumb from "../../components/CtaOptionThumb";
import EffectVisualPreview from "../../components/EffectVisualPreview";
import { makeFilterConfig, VIDEO_FILTERS_BY_ID } from "../../data/video-filters";
import { STICKER_BY_ID } from "../../lib/sticker-3d";
import { TEMPLATE_BY_ID } from "../../data/text-templates";
import { CATALOG_ITEMS } from "../../lib/video-studio-catalog";
import type { TimelineInsert } from "../../types";
import { assetSrc, getAsset } from "../assets";

/**
 * The real thing, on the website.
 *
 * Every preview in this file is drawn by the component the studio itself
 * uses, which in turn calls the same renderer as the exported video. A filter
 * card here is `FilterPreviewCanvas` grading an actual project still; a
 * sticker is `StickerPreviewCanvas` running the real 3D draw; a lower third
 * is `TemplatePreviewCanvas` with the real template renderer; a badge is
 * `CtaOptionThumb` painting the real call-to-action.
 *
 * So these are not impressions of the product — they are the product,
 * rendering in a marketing page. Nothing here can drift from the app, because
 * there is nothing here to drift.
 *
 * It is the heaviest thing the website loads, so it is imported lazily by the
 * sections that use it and only mounted once they are on screen.
 */

/** A project still to grade, so filters are shown on real footage. */
function sceneStill(): string | undefined {
  const asset = getAsset("scene.02");
  return asset?.file ? assetSrc(asset, 1280) : undefined;
}

/* ------------------------------------------------------------- filters */

export function RealFilter({
  filterId,
  width = 240,
  original = false,
}: {
  filterId: string;
  width?: number;
  original?: boolean;
}) {
  const config = useMemo(() => makeFilterConfig(filterId), [filterId]);
  const height = Math.round((width * 9) / 16);
  return (
    <FilterPreviewCanvas
      config={config}
      imageUrl={sceneStill()}
      showOriginal={original}
      width={width * 2}
      height={height * 2}
      className="mkt-real-canvas"
    />
  );
}

export function filterName(id: string): string {
  return VIDEO_FILTERS_BY_ID[id]?.name ?? id;
}

/* ------------------------------------------------------------ stickers */

export function RealSticker({ stickerId, size = 78 }: { stickerId: string; size?: number }) {
  return (
    <StickerPreviewCanvas
      stickerId={stickerId}
      size={size}
      backdrop="none"
      glow={0.3}
      shadow={0.8}
      className="mkt-real-canvas"
    />
  );
}

export function stickerName(id: string): string {
  return STICKER_BY_ID[id]?.name ?? id;
}

/* ------------------------------------------- text templates & lower thirds */

export function RealTemplate({
  templateId,
  content,
  width = 250,
}: {
  templateId: string;
  content?: Record<string, string>;
  width?: number;
}) {
  return (
    <TemplatePreviewCanvas
      templateId={templateId}
      content={content}
      width={width}
      className="mkt-real-canvas"
    />
  );
}

export function templateName(id: string): string {
  return TEMPLATE_BY_ID[id]?.name ?? id;
}

/* -------------------------------------------------- calls to action */

/** Build the insert the studio would build when this badge is added. */
function ctaInsert(platformId: string): TimelineInsert | null {
  const item = CATALOG_ITEMS.call_to_action.find((entry) => entry.type === `cta_${platformId}`);
  if (!item) return null;
  return {
    id: `mkt-${item.type}`,
    category: item.category,
    type: item.type,
    title: item.name,
    startTime: 0,
    duration: item.defaultDuration,
    presetPosition: "center",
    size: item.defaultSize ?? 1,
    opacity: 1,
    content: item.defaultContent ? { ...item.defaultContent } : {},
    visualOptions: item.defaultVisualOptions ? { ...item.defaultVisualOptions } : undefined,
  } as unknown as TimelineInsert;
}

export function RealCta({
  platformId,
  width = 168,
  height = 62,
}: {
  platformId: string;
  width?: number;
  height?: number;
}) {
  const insert = useMemo(() => ctaInsert(platformId), [platformId]);
  if (!insert) return null;
  return <CtaOptionThumb item={insert} width={width} height={height} />;
}

/* ---------------------------------------------------- audio visualisers */

/**
 * The real visualiser, running the render engine's own draw loop. The card's
 * markup is the studio's, which means Tailwind classes the website does not
 * ship — `.mkt-real-visualiser` in marketing.css supplies the same box.
 */
export function RealVisualiser({ type = "minimal_voice" }: { type?: string }) {
  const item = useMemo(
    () => (CATALOG_ITEMS.audio_visualizers ?? []).find((entry) => entry.type === type),
    [type]
  );
  if (!item) return null;
  return (
    <div className="mkt-real-visualiser">
      <EffectVisualPreview item={item} />
    </div>
  );
}

export function visualiserName(type: string): string {
  return (CATALOG_ITEMS.audio_visualizers ?? []).find((entry) => entry.type === type)?.name ?? type;
}

export function ctaName(platformId: string): string {
  return (
    CATALOG_ITEMS.call_to_action.find((entry) => entry.type === `cta_${platformId}`)?.name ??
    platformId
  );
}
