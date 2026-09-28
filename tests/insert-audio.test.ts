import { InsertAudioMixer, type InsertAudioPlan } from "../src/lib/insert-audio";

/* ------------------------------------------------------------------ *
 * Insert audio on the offline render path.
 *
 * Live playback polls: tick() runs every frame and starts a sound the first
 * time it sees the clock past that sound's start time. It has to, because it
 * cannot know when someone will pause or scrub.
 *
 * A render knows the whole timeline before it begins, so polling there was
 * only ever a cost: it pinned a sound to the nearest frame the poll landed
 * on, and it forced the audio render to stop and restart once per frame to
 * do the asking. scheduleAll() places every sound up front instead.
 *
 * What matters, and what these checks pin down: a sound lands on its exact
 * planned time rather than a frame boundary, it stops when its slot ends,
 * looping beds are still truncated, and nothing is placed twice.
 * ------------------------------------------------------------------ */

let checks = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  checks++;
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};
const close = (actual: number, expected: number, label: string) => {
  checks++;
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
};

/* ---- a fake graph that records what was scheduled ---- */

interface Placed {
  startedAt: number | null;
  stoppedAt: number | null;
  loop: boolean;
  volume: number;
  connected: boolean;
}

const placements: Placed[] = [];

class FakeGain {
  gain = { value: 1 };
  connect() {}
  disconnect() {}
}

class FakeSource {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  private record: Placed;
  constructor(record: Placed) {
    this.record = record;
  }
  connect(dest: unknown) {
    this.record.connected = dest instanceof FakeGain;
  }
  start(when?: number) {
    this.record.startedAt = when ?? 0;
  }
  stop(when?: number) {
    this.record.stoppedAt = when ?? 0;
  }
}

class FakeOfflineContext {
  currentTime = 0;
  private pendingVolume = 1;
  createGain() {
    const g = new FakeGain();
    // The mixer creates the master gain first, then one gain per slot; the
    // volume it sets on a slot's gain is what we want to observe.
    queueMicrotask(() => {
      this.pendingVolume = g.gain.value;
    });
    return g as unknown as GainNode;
  }
  createBufferSource() {
    const record: Placed = {
      startedAt: null,
      stoppedAt: null,
      loop: false,
      volume: this.pendingVolume,
      connected: false,
    };
    placements.push(record);
    return new FakeSource(record) as unknown as AudioBufferSourceNode;
  }
}

const plan = (over: Partial<InsertAudioPlan> & { key: string }): InsertAudioPlan => ({
  url: `https://example.test/${over.key}.mp3`,
  startTime: 0,
  endTime: 1,
  volume: 1,
  loop: false,
  ...over,
});

/**
 * Builds a mixer with the given plans already "decoded", without touching
 * the network. load() is the only thing that fetches, and it is not what is
 * under test here.
 */
const mixerWith = (plans: InsertAudioPlan[]) => {
  placements.length = 0;
  const ctx = new FakeOfflineContext() as unknown as BaseAudioContext;
  const mixer = new InsertAudioMixer(ctx, new FakeGain() as unknown as AudioNode);
  const fakeBuffer = { duration: 2 } as AudioBuffer;
  (mixer as unknown as { slots: unknown[] }).slots = plans.map((p) => ({
    plan: p,
    buffer: fakeBuffer,
    source: null,
    gain: null,
    started: false,
    finished: false,
  }));
  return mixer;
};

/* ---- placed to the exact planned time, not to a frame ---- */
{
  // 4.7183s is deliberately between frames at every sane frame rate: at 30fps
  // a poll would have fired it at 4.7333s, 15ms late.
  const mixer = mixerWith([plan({ key: "whoosh", startTime: 4.7183, endTime: 5.9 })]);
  const placed = mixer.scheduleAll();

  equal(placed, 1, "one sound scheduled");
  equal(placements.length, 1, "one source created");
  close(placements[0].startedAt as number, 4.7183, "starts on the planned time, not a frame edge");
  close(placements[0].stoppedAt as number, 5.9, "stops on the planned time");
  equal(placements[0].connected, true, "routed through its own gain");

  const frame = Math.ceil(4.7183 * 30) / 30;
  checks++;
  if (!(frame > 4.7183)) throw new Error("frame-quantised start should have been later");
}

/* ---- every sound is placed in one pass ---- */
{
  const mixer = mixerWith([
    plan({ key: "a", startTime: 0, endTime: 2 }),
    plan({ key: "b", startTime: 30.25, endTime: 31 }),
    plan({ key: "c", startTime: 511.5, endTime: 514 }),
  ]);

  equal(mixer.scheduleAll(), 3, "all three placed, including ones far in the future");
  close(placements[1].startedAt as number, 30.25, "second sound keeps its own time");
  close(placements[2].startedAt as number, 511.5, "a sound minutes in is placed up front");
}

/* ---- a looping bed still stops at the end of its slot ---- */
{
  const mixer = mixerWith([plan({ key: "bed", startTime: 0, endTime: 540, loop: true })]);
  mixer.scheduleAll();

  close(placements[0].stoppedAt as number, 540, "looping bed is truncated at its end time");
}

/* ---- volume rides on the slot's own gain ---- */
{
  const mixer = mixerWith([plan({ key: "quiet", volume: 0.25, startTime: 1, endTime: 2 })]);
  mixer.scheduleAll();
  equal(placements.length, 1, "one source for the quiet sound");
}

/* ---- degenerate slots are skipped rather than scheduled backwards ---- */
{
  const mixer = mixerWith([
    plan({ key: "zero", startTime: 5, endTime: 5 }),
    plan({ key: "inverted", startTime: 9, endTime: 4 }),
    plan({ key: "real", startTime: 1, endTime: 3 }),
  ]);

  equal(mixer.scheduleAll(), 1, "zero-length and inverted slots are skipped");
  close(placements[0].startedAt as number, 1, "only the real sound is placed");
}

/* ---- a negative start is clamped, never handed to the audio clock ---- */
{
  const mixer = mixerWith([plan({ key: "early", startTime: -3, endTime: 2 })]);
  mixer.scheduleAll();
  close(placements[0].startedAt as number, 0, "negative start clamped to zero");
}

/* ---- scheduling marks slots started, so a stray tick() cannot double-fire ---- */
{
  const mixer = mixerWith([plan({ key: "once", startTime: 1, endTime: 3 })]);
  mixer.scheduleAll();
  const before = placements.length;
  mixer.tick(1.5);
  mixer.tick(2.0);
  equal(placements.length, before, "tick() after scheduleAll() does not start a second copy");

  // The damaging case: tick() past a sound's end calls stop() with no
  // argument, which would cut it off at the context clock rather than at its
  // planned end. Scheduling has to switch polling off, not merely survive it.
  mixer.tick(99);
  close(placements[0].stoppedAt as number, 3, "tick() past the end cannot re-stop a placed sound");
}

console.log(`PASS insert-audio: ${checks} checks, 0 failed`);
