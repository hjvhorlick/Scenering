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

  // A music selection replaces the previous selection. Keep this defensive
  // guard in the audio engine as well as the UI so legacy saved projects can
  // never render two background beds over one another.
  let lastMusicIndex = -1;
  for (let i = 0; i < inserts.length; i++) {
    if (inserts[i].category === "background_music") lastMusicIndex = i;
  }

  for (let insertIndex = 0; insertIndex < inserts.length; insertIndex++) {
    const ins = inserts[insertIndex];
    if (ins.category === "background_music" && insertIndex !== lastMusicIndex) continue;
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
  ctx: BaseAudioContext
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
  private ctx: BaseAudioContext;
  private master: GainNode;
  private slots: ActiveSlot[] = [];
  /** Set by scheduleAll(): the timeline is already placed, so polling must stop. */
  private prescheduled = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    // 0.85 gain headroom prevents harsh digital clipping when multiple sounds sum together
    this.master.gain.value = 0.85;
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
      // Gentle 25ms micro-fade prevents hard DC-offset clicks/crackles at buffer start
      if (typeof gain.gain.setValueAtTime === "function" && typeof gain.gain.exponentialRampToValueAtTime === "function") {
        try {
          const now = this.ctx.currentTime;
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.001, slot.plan.volume), now + 0.025);
        } catch {}
      }
      source.connect(gain);
      gain.connect(this.master);

      const bufDur = Math.max(0.01, slot.buffer.duration);
      const offset = ((at - slot.plan.startTime) % bufDur + bufDur) % bufDur;
      source.start(this.ctx.currentTime, offset);

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

  /**
   * Offline render path: place every sound on the timeline up front.
   *
   * Live playback has to poll, because it cannot know when the user will
   * pause or scrub. An offline render knows the whole timeline before it
   * starts, so each sound is scheduled once at its exact start time and
   * stopped at its exact end time. The Web Audio clock then places it to the
   * sample, instead of the nearest frame a poll happened to land on, and the
   * render no longer has to be interrupted once per frame to check.
   *
   * Only for an OfflineAudioContext, and only before rendering begins.
   * Do not call tick() afterwards — the sounds are already placed.
   */
  scheduleAll(): number {
    this.prescheduled = true;
    let placed = 0;
    for (const slot of this.slots) {
      const { startTime, endTime, loop, volume } = slot.plan;
      if (!(endTime > startTime)) continue;
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = slot.buffer;
        if (loop) source.loop = true;

        const gain = this.ctx.createGain();
        gain.gain.value = volume;

        if (typeof gain.gain.setValueAtTime === "function" && typeof gain.gain.exponentialRampToValueAtTime === "function") {
          try {
            const start = Math.max(0, startTime);
            const end = Math.max(0, endTime);
            const targetVol = Math.max(0.001, volume);
            const fadeSec = Math.min(0.04, (end - start) * 0.1);
            if (fadeSec > 0.005) {
              gain.gain.setValueAtTime(0.001, start);
              gain.gain.exponentialRampToValueAtTime(targetVol, start + fadeSec);
              gain.gain.setValueAtTime(targetVol, end - fadeSec);
              gain.gain.exponentialRampToValueAtTime(0.001, end);
            }
          } catch {}
        }

        source.connect(gain);
        gain.connect(this.master);

        source.start(Math.max(0, startTime));
        // Harmless for a one-shot that has already finished; it truncates a
        // sound that would otherwise outrun its slot, which is what tick() did.
        source.stop(Math.max(0, endTime));

        slot.source = source;
        slot.gain = gain;
        slot.started = true;
        placed++;
      } catch (err) {
        console.warn("Insert audio scheduling failed:", err);
      }
    }
    return placed;
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
    // Everything is already placed on the clock. Polling now would only do
    // harm: the stop() below takes no argument, so it would cut a sound off
    // at the context's current time instead of its planned end.
    if (this.prescheduled) return;
    for (const slot of this.slots) {
      if (slot.started) {
        // Stop at the planned end — also for looping beds (music that fills the video)
        if (time >= slot.plan.endTime && slot.source) {
          const s = slot.source;
          const g = slot.gain;
          if (g && typeof g.gain.setValueAtTime === "function" && typeof g.gain.linearRampToValueAtTime === "function") {
            try {
              const now = this.ctx.currentTime;
              g.gain.setValueAtTime(g.gain.value, now);
              g.gain.linearRampToValueAtTime(0.001, now + 0.03);
            } catch {}
          }
          setTimeout(() => {
            try {
              s.stop();
            } catch {}
          }, 35);
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
    this.prescheduled = false;
    for (const slot of this.slots) {
      if (slot.source) {
        const s = slot.source;
        // Drop onended first: it checks `slot.source === source`, and we are
        // about to reassign that field. Clearing it keeps the callback from
        // firing against a slot that has already been reset.
        try { s.onended = null; } catch {}
        try { s.stop(); } catch {}
        // A stopped source still holds its connection to the master gain
        // until it is collected; unhook it now so a paused preview leaves
        // nothing behind on the music bus.
        try { s.disconnect(); } catch {}
      }
      if (slot.gain) {
        try { slot.gain.disconnect(); } catch {}
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
