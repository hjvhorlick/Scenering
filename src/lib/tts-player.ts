// Audio Player & Speechify TTS client for Scenering Studio
import {
  type VoiceEchoConfig,
  type ElementEchoRoute,
  routeElementThroughEcho,
  voiceEchoIsActive,
  getEchoAudioContext,
} from "./voice-echo";
import { sanitizeTextForSpeech } from "./speech-sanitizer";
import { synthesizeSpeechify } from "./speechify-client";

class TTSAudioPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private audioCache = new Map<string, string>(); // synthesis key -> blob URL
  private currentPlayingId: string | number | null = null;
  private onEndCallbacks = new Set<() => void>();
  /** Echo/ambience the voice is played through (set from the Voiceover step). */
  private voiceEcho: VoiceEchoConfig | null = null;
  private activeEchoRoute: ElementEchoRoute | null = null;

  /** Every synthesized preview is heard through the same echo as the render. */
  public setVoiceEcho(config: VoiceEchoConfig | null) {
    this.voiceEcho = config;
    try {
      this.activeEchoRoute?.update(config || ({} as VoiceEchoConfig));
    } catch {}
  }

  private attachEcho(audio: HTMLAudioElement) {
    this.disposeEchoRoute();
    const echoOn = !!this.voiceEcho && voiceEchoIsActive(this.voiceEcho);
    if (!echoOn) return;
    const route = routeElementThroughEcho(audio, this.voiceEcho!, getEchoAudioContext, null);
    if (route) this.activeEchoRoute = route;
  }

  private disposeEchoRoute() {
    try {
      this.activeEchoRoute?.dispose();
    } catch {}
    this.activeEchoRoute = null;
  }

  public getCurrentPlayingId(): string | number | null {
    return this.currentPlayingId;
  }

  public stop() {
    this.disposeEchoRoute();
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch {}
      this.activeAudio = null;
    }
    this.currentPlayingId = null;
    this.triggerEndCallbacks();
  }

  private triggerEndCallbacks() {
    this.onEndCallbacks.forEach((callback) => {
      try {
        callback();
      } catch {}
    });
    this.onEndCallbacks.clear();
  }

  private rememberAudio(cacheKey: string, audioUrl: string) {
    this.audioCache.set(cacheKey, audioUrl);
    while (this.audioCache.size > 64) {
      const oldest = this.audioCache.keys().next().value;
      if (!oldest) break;
      const oldUrl = this.audioCache.get(oldest);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      this.audioCache.delete(oldest);
    }
  }

  public async play(
    text: string,
    voice: string = "speechify_male_01",
    speed: number = 1.0,
    volume: number = 1.0,
    playingId: string | number = "test",
    onEnded?: () => void
  ): Promise<void> {
    if (this.currentPlayingId === playingId) {
      this.stop();
      return;
    }

    this.stop();
    this.currentPlayingId = playingId;
    if (onEnded) this.onEndCallbacks.add(onEnded);

    const cleanText = sanitizeTextForSpeech(text).trim();
    if (!cleanText) {
      this.stop();
      return;
    }

    // Keep playback of user-supplied audio files and already prepared tracks.
    if (
      voice.startsWith("url:") ||
      voice.startsWith("data:") ||
      voice.startsWith("blob:") ||
      voice.startsWith("http") ||
      voice.startsWith("/api/custom-audio/")
    ) {
      const directUrl = voice.startsWith("url:") ? voice.replace(/^url:/, "") : voice;
      await this.playDirectUrl(directUrl, speed, volume, playingId);
      return;
    }

    const cacheKey = `${voice}\u0000${cleanText}`;
    let audioUrl = this.audioCache.get(cacheKey);

    try {
      if (!audioUrl) {
        const synthesized = await synthesizeSpeechify(cleanText, voice);
        audioUrl = URL.createObjectURL(synthesized.blob);
        this.rememberAudio(cacheKey, audioUrl);
      }

      if (this.currentPlayingId !== playingId) return;
      const audio = new Audio(audioUrl);
      audio.loop = false;
      this.activeAudio = audio;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));
      audio.volume = Math.max(0, Math.min(1, volume));
      this.attachEcho(audio);
      audio.onended = () => {
        if (this.currentPlayingId === playingId) this.stop();
      };
      audio.onerror = () => {
        if (this.currentPlayingId === playingId) this.stop();
      };
      await audio.play();
    } catch (error) {
      if (this.currentPlayingId === playingId) this.stop();
      throw error;
    }
  }

  /** Play an uploaded, imported, or otherwise user-provided audio URL. */
  public async playDirectUrl(
    audioUrl: string,
    speed: number,
    volume: number,
    playingId: string | number
  ): Promise<void> {
    try {
      const audio = new Audio(audioUrl);
      audio.loop = false;
      this.activeAudio = audio;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));
      audio.volume = Math.max(0, Math.min(1, volume));
      this.attachEcho(audio);
      audio.onended = () => {
        if (this.currentPlayingId === playingId) this.stop();
      };
      audio.onerror = () => {
        if (this.currentPlayingId === playingId) this.stop();
      };
      await audio.play();
    } catch (error) {
      if (this.currentPlayingId === playingId) this.stop();
      throw error;
    }
  }
}

export const ttsPlayer = new TTSAudioPlayer();
