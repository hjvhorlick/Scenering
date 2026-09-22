/**
 * Insert Audio Engine — plays the audio attached to timeline inserts
 * (Background Music, Sound Effects, CTA jingles, Intro/Outro attached sounds)
 * in both the live preview (VideoPreview) and the final render (RenderView).
 *
 * Before this module existed, insert audio was only used for credit
 * attribution — it was never actually heard in preview or render.
 */
import type { TimelineInsert } from "../types";
import { sectionSoundUrl, type SectionConfig } from "../data/intro-outro";

export interface InsertAudioPlan {
  key: string;
  url: string;
  startTime: number; // absolute seconds on the video timeline
  endTime: number; // absolute seconds
  volume: number; // 0..1
  loop: boolean;
}

/**
 * Computes when every insert's sound should play on the absolute video
 * timeline (intro + script scenes + outro).
 */
export function buildInsertAudioPlan(
  inserts: TimelineInsert[] | undefined,
  totalDuration: number
): InsertAudioPlan[] {
  if (!inserts || inserts.length === 0 || totalDuration <= 0) return [];

  const plans: InsertAudioPlan[] = [];

  for (const ins of inserts) {
    const as = ins.audioSettings;
    if (!as || !as.soundUrl) continue;
    if (as.muted) continue;

    const volume = Math.max(0, Math.min(1, as.volume ?? 0.8));
    const isMusic = ins.category === "background_music";

    // Loop: explicit setting wins; legacy `loopAudio` (old catalog data) counts;
    // background music loops by default so short tracks fill the whole video.
    const loop =
      as.loop !== undefined
        ? Boolean(as.loop)
        : Boolean((as as { loopAudio?: boolean }).loopAudio) || isMusic;

    const delay = Math.max(0, as.delay ?? 0);
    let startTime: number;
    let endTime: number;

    if (ins.category === "intro") {
      // Intro is always the first segment of the timeline
      startTime = 0;
      endTime = Math.min(totalDuration, Math.max(0, ins.duration));
    } else if (ins.category === "outro") {
      // Outro is always the last segment
      startTime = Math.max(0, totalDuration - Math.max(0, ins.duration));
      endTime = totalDuration;
    } else if (isMusic && ins.scope === "entire_video") {
      startTime = 0;
      endTime = totalDuration;
    } else if (isMusic && ins.scope === "from_here") {
      startTime = Math.max(0, ins.startTime);
      endTime = totalDuration;
    } else if (isMusic && ins.scope === "this_scene") {
      startTime = Math.max(0, ins.startTime);
      endTime = Math.min(totalDuration, ins.startTime + Math.max(0.5, ins.duration));
    } else {
      startTime = Math.max(0, ins.startTime);
      // Music keeps going to the end of the video; everything else is bounded
      endTime = isMusic
        ? totalDuration
        : Math.min(totalDuration, ins.startTime + Math.max(0.5, ins.duration));
    }

    // Delay shifts the whole sound window
    startTime += delay;
    endTime += delay;
    if (startTime >= totalDuration || endTime <= startTime) continue;

    plans.push({ key: ins.id, url: as.soundUrl, startTime, endTime, volume, loop });
  }

  return plans;
}

/**
 * Sound plan for the Intro / Outro sections built in the Intro & Outro studio.
 * These are not timeline inserts — they live on the project settings — but they
 * ride the exact same mixer so they are heard in preview and baked into the
 * exported file.
 */
export function buildSectionAudioPlan(
  intro: SectionConfig | null | undefined,
  outro: SectionConfig | null | undefined,
  introDuration: number,
  totalDuration: number
): InsertAudioPlan[] {
  const plans: InsertAudioPlan[] = [];
  if (totalDuration <= 0) return plans;

  if (intro?.enabled) {
    const url = sectionSoundUrl(intro);
    if (url) {
      plans.push({
        key: "section_intro",
        url,
        startTime: 0,
        endTime: Math.min(totalDuration, Math.max(0.5, introDuration)),
        volume: Math.max(0, Math.min(1, intro.volume)),
        loop: false,
      });
    }
  }

  if (outro?.enabled) {
    const url = sectionSoundUrl(outro);
    if (url) {
      const dur = Math.max(0.5, outro.duration);
      plans.push({
        key: "section_outro",
        url,
        startTime: Math.max(0, totalDuration - dur),
        endTime: totalDuration,
        volume: Math.max(0, Math.min(1, outro.volume)),
        loop: false,
      });
    }
  }

  return plans;
}

// ---- Audio buffer cache (shared across preview & render sessions) ----
const bufferCache = new Map<string, AudioBuffer>();

export async function decodeInsertAudio(
  url: string,
  ctx: AudioContext
): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuf);
    bufferCache.set(url, buffer);
    return buffer;
  } catch (err) {
    console.warn(`Insert audio decode failed for ${url}:`, err);
    return null;
  }
}

interface ActiveSlot {
  plan: InsertAudioPlan;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  started: boolean;
  finished: boolean;
}

/**
 * Schedules & tracks insert audio for one playback session.
 * Call startFrom() once when playback begins, then tick() every frame with
 * the current absolute timeline time. stop()/dispose() when playback ends.
 */
export class InsertAudioMixer {
  private ctx: AudioContext;
  private master: GainNode;
  private slots: ActiveSlot[] = [];

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(dest);
  }

  /** Pre-decode every planned sound. Slots for undecodable URLs are dropped. */
  async load(plans: InsertAudioPlan[]): Promise<number> {
    this.slots = [];
    for (const plan of plans) {
      const buffer = await decodeInsertAudio(plan.url, this.ctx);
      if (!buffer) continue;
      this.slots.push({
        plan,
        buffer,
        source: null,
        gain: null,
        started: false,
        finished: false,
      });
    }
    return this.slots.length;
  }

  private startSlot(slot: ActiveSlot, at: number) {
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = slot.buffer;
      if (slot.plan.loop) source.loop = true;

      const gain = this.ctx.createGain();
      gain.gain.value = slot.plan.volume;
      source.connect(gain);
      gain.connect(this.master);

      const bufDur = Math.max(0.01, slot.buffer.duration);
      const offset = ((at - slot.plan.startTime) % bufDur + bufDur) % bufDur;
      source.start(0, offset);

      source.onended = () => {
        if (slot.source === source) {
          slot.source = null;
          slot.gain = null;
          if (!slot.plan.loop) slot.finished = true;
        }
      };

      slot.source = source;
      slot.gain = gain;
      slot.started = true;
    } catch (err) {
      console.warn("Insert audio start failed:", err);
    }
  }

  /** Begin everything that is already active at `time`. */
  startFrom(time: number) {
    for (const slot of this.slots) {
      if (
        !slot.started &&
        !slot.finished &&
        time >= slot.plan.startTime &&
        time < slot.plan.endTime
      ) {
        this.startSlot(slot, time);
      }
    }
  }

  /** Per-frame update: start sounds whose start time was crossed, stop ones past their end. */
  tick(time: number) {
    for (const slot of this.slots) {
      if (slot.started) {
        // Stop at the planned end — also for looping beds (music that fills the video)
        if (time >= slot.plan.endTime && slot.source) {
          try {
            slot.source.stop();
          } catch {}
          slot.source = null;
          slot.finished = true;
        }
        continue;
      }
      if (slot.finished) continue;
      if (time >= slot.plan.startTime && time < slot.plan.endTime) {
        this.startSlot(slot, time);
      } else if (time >= slot.plan.endTime) {
        slot.finished = true;
      }
    }
  }

  /** Stop everything immediately and reset state. */
  stop() {
    for (const slot of this.slots) {
      if (slot.source) {
        try {
          slot.source.stop();
        } catch {}
      }
      slot.source = null;
      slot.gain = null;
      slot.started = false;
      slot.finished = false;
    }
  }

  dispose() {
    this.stop();
    this.slots = [];
    try {
      this.master.disconnect();
    } catch {}
  }
}
