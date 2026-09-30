import type { CatalogItem } from "./video-studio-catalog";
import type { CustomerLogoConfig, TimelineInsert } from "../types";

export interface CatalogInsertOptions {
  currentPlayheadTime?: number;
  totalDuration?: number;
  customerLogo?: CustomerLogoConfig;
  volume?: number;
  /** Pin this item to frame zero and keep it the length of the whole video. */
  forceFullVideo?: boolean;
}

/**
 * Turn one catalogue card into the exact timeline insert used by previews,
 * renders and the properties editor.
 *
 * This used to live inside VideoStudio. Visualisers can be inserted from both
 * Video Studio and Voiceover, while music lives in Voiceover, so keeping the
 * construction here prevents the screens from producing subtly different
 * versions of the same item.
 */
export function createCatalogInsert(
  item: CatalogItem,
  options: CatalogInsertOptions = {}
): TimelineInsert {
  const totalDuration = Math.max(1, options.totalDuration || 60);
  let startTime = Math.max(0, options.currentPlayheadTime || 0);
  if (item.category === "intro") startTime = 0;
  else if (item.category === "outro") {
    startTime = Math.max(0, totalDuration - item.defaultDuration);
  }

  const spansWholeVideo = Boolean(options.forceFullVideo || item.spansFullVideo);
  if (spansWholeVideo) startTime = 0;

  const defaultContent = item.defaultContent ? { ...item.defaultContent } : {};
  const logoUrl =
    defaultContent.logoUrl ||
    (options.customerLogo?.enabled && options.customerLogo.url
      ? options.customerLogo.url
      : "/scenering-logo.png");
  const volume = options.volume ?? item.defaultAudioSettings?.volume ?? 0.8;
  const soundUrl = item.defaultAudioSettings?.soundUrl || defaultContent.soundUrl;

  return {
    id: `${item.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: item.category,
    type: item.type,
    title: item.name,
    startTime,
    duration: spansWholeVideo ? totalDuration : item.defaultDuration,
    videoUrl: item.videoUrl || defaultContent.videoUrl,
    position: { x: 0.5, y: 0.5 },
    presetPosition: item.defaultPosition || "center",
    size: item.defaultSize || 1,
    opacity: 1,
    intensity: 1,
    audioSource: item.defaultAudioSource || "voice",
    scope:
      item.category === "background_music" && spansWholeVideo
        ? "entire_video"
        : undefined,
    content: {
      ...defaultContent,
      videoUrl: item.videoUrl || defaultContent.videoUrl,
      showLogo: defaultContent.showLogo ?? true,
      includeLogo: defaultContent.includeLogo ?? true,
      logoUrl,
      tensionStyle: defaultContent.tensionStyle || "flare",
      soundUrl: soundUrl || defaultContent.soundUrl,
      soundVolume: volume,
    },
    visualOptions: item.defaultVisualOptions
      ? {
          ...item.defaultVisualOptions,
          ...(spansWholeVideo ? { spanFullVideo: true } : {}),
        }
      : spansWholeVideo
        ? { spanFullVideo: true }
        : undefined,
    audioSettings: item.defaultAudioSettings
      ? {
          ...item.defaultAudioSettings,
          volume,
          soundUrl: soundUrl || item.defaultAudioSettings.soundUrl,
          loop:
            item.defaultAudioSettings.loop !== undefined
              ? item.defaultAudioSettings.loop
              : Boolean((item.defaultAudioSettings as { loopAudio?: boolean }).loopAudio),
        }
      : { volume, soundUrl },
  };
}
