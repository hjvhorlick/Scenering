// Audio Player & TTS Service for Scenering Studio
import {
  VoiceEchoConfig,
  ElementEchoRoute,
  routeElementThroughEcho,
  voiceEchoIsActive,
  getEchoAudioContext,
} from "./voice-echo";
import { LEGACY_VOICE_IDS } from "../data/voice-presets";
import { sanitizeTextForSpeech } from "./speech-sanitizer";
import { getVoiceAnalyser, tapVoiceElement, voiceMonitorWanted } from "./voice-monitor";
// Provides high-fidelity MP3/WAV playback via /api/tts and full support for over 300+ Web Speech API voices with gender-aware matching

export interface BrowserVoiceInfo {
  id: string; // e.g. "browser:Microsoft David Desktop"
  name: string;
  lang: string;
  gender: "male" | "female";
  isDefault: boolean;
  localService: boolean;
  voiceURI: string;
}

/**
 * Narrator personas were renamed away from actor names. Audio and projects
 * saved under the old ids still play with the right voice and pitch.
 */
function canonicalVoiceId(voiceId: string): string {
  const v = (voiceId || "").toLowerCase().replace(/^(browser:|web:)/, "").trim();
  return LEGACY_VOICE_IDS[v] ?? v;
}

export function isMaleVoiceIdentifier(voiceId: string): boolean {
  const v = canonicalVoiceId(voiceId);
  return (
    v.includes("guy") ||
    v.includes("christopher") ||
    v.includes("ryan") ||
    v.includes("william") ||
    v.includes("david") ||
    v.includes("mark") ||
    v.includes("george") ||
    v.includes("richard") ||
    v.includes("james") ||
    v.includes("daniel") ||
    v.includes("alex") ||
    v.includes("fred") ||
    v.includes("tom") ||
    v.includes("eric") ||
    v.includes("roger") ||
    v.includes("puck") ||
    v.includes("charon") ||
    v.includes("fenrir") ||
    v.includes("male") ||
    v.includes("standard-b") ||
    v.includes("standard-d") ||
    v.includes("wavenet-b") ||
    v.includes("wavenet-d") ||
    v.includes("onyx") ||
    v.includes("echo") ||
    v.includes("steffan") ||
    v.includes("brian") ||
    // persona narrator presets (male)
    v.includes("storyteller") ||
    v.includes("naturalist") ||
    v.includes("titan") ||
    v.includes("sentinel") ||
    v.includes("firebrand") ||
    v.includes("connor") ||
    v.includes("liam")
  );
}

export function detectVoiceGenderFromName(name: string): "male" | "female" {
  const lower = canonicalVoiceId(name);
  if (
    lower.includes("female") ||
    lower.includes("woman") ||
    lower.includes("girl") ||
    lower.includes("jenny") ||
    lower.includes("aria") ||
    lower.includes("zira") ||
    lower.includes("sonia") ||
    lower.includes("natasha") ||
    lower.includes("samantha") ||
    lower.includes("victoria") ||
    lower.includes("karen") ||
    lower.includes("susan") ||
    lower.includes("hazel") ||
    lower.includes("catherine") ||
    lower.includes("linda") ||
    lower.includes("stephanie") ||
    lower.includes("fiona") ||
    lower.includes("moira") ||
    lower.includes("tessa") ||
    lower.includes("veena") ||
    lower.includes("kore") ||
    lower.includes("zephyr") ||
    lower.includes("aoede") ||
    lower.includes("raconteur") ||
    lower.includes("sovereign") ||
    lower.includes("enigma") ||
    lower.includes("investigator") ||
    lower.includes("confidante")
  ) {
    return "female";
  }

  if (
    lower.includes("male") ||
    lower.includes("man") ||
    lower.includes("guy") ||
    lower.includes("christopher") ||
    lower.includes("ryan") ||
    lower.includes("william") ||
    lower.includes("david") ||
    lower.includes("mark") ||
    lower.includes("george") ||
    lower.includes("richard") ||
    lower.includes("james") ||
    lower.includes("daniel") ||
    lower.includes("alex") ||
    lower.includes("fred") ||
    lower.includes("tom") ||
    lower.includes("eric") ||
    lower.includes("roger") ||
    lower.includes("puck") ||
    lower.includes("charon") ||
    lower.includes("fenrir") ||
    lower.includes("standard-b") ||
    lower.includes("standard-d") ||
    lower.includes("sentinel") ||
    lower.includes("connor") ||
    lower.includes("naturalist") ||
    lower.includes("storyteller") ||
    lower.includes("firebrand") ||
    lower.includes("brian") ||
    lower.includes("liam")
  ) {
    return "male";
  }

  return "female";
}

export function getAvailableWebVoices(): BrowserVoiceInfo[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  const rawVoices = window.speechSynthesis.getVoices();
  return rawVoices.map((v) => ({
    id: `browser:${v.name}`,
    name: v.name,
    lang: v.lang,
    gender: detectVoiceGenderFromName(v.name),
    isDefault: v.default,
    localService: v.localService,
    voiceURI: v.voiceURI,
  }));
}

class TTSAudioPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private audioCache = new Map<string, string>(); // key -> blobUrl
  private currentPlayingId: string | number | null = null;
  private onEndCallbacks = new Set<() => void>();
  /** Echo/ambience the voice is played through (set from the Voiceover step) */
  private voiceEcho: VoiceEchoConfig | null = null;
  private activeEchoRoute: ElementEchoRoute | null = null;

  /**
   * Every voice the player is asked to speak is heard through this echo, so the
   * "Test voice" buttons sound exactly like the finished video. Sound-effect
   * previews never go through this player, so they stay dry.
   */
  public setVoiceEcho(config: VoiceEchoConfig | null) {
    this.voiceEcho = config;
    try {
      this.activeEchoRoute?.update(config || ({} as VoiceEchoConfig));
    } catch {}
  }

  /**
   * Routes one freshly created audio element through the echo chain, and —
   * only while something on screen is drawing the voice — through the shared
   * analyser as well.
   *
   * When neither is wanted the element is left exactly as it was: plain
   * playback, no Web Audio, nothing that can go wrong.
   */
  private attachEcho(audio: HTMLAudioElement) {
    this.disposeEchoRoute();
    const echoOn = !!this.voiceEcho && voiceEchoIsActive(this.voiceEcho);
    const tap = voiceMonitorWanted() ? getVoiceAnalyser() : null;
    if (!echoOn && !tap) return;

    if (echoOn) {
      const route = routeElementThroughEcho(audio, this.voiceEcho!, getEchoAudioContext, tap);
      if (route) {
        this.activeEchoRoute = route;
        return;
      }
      // The echo could not be built; fall through and at least try to listen.
    }
    if (tap) tapVoiceElement(audio);
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
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.currentPlayingId = null;
    this.triggerEndCallbacks();
  }

  private triggerEndCallbacks() {
    this.onEndCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
    this.onEndCallbacks.clear();
  }

  public async play(
    text: string,
    voice: string = "guy",
    speed: number = 1.0,
    volume: number = 1.0,
    playingId: string | number = "test",
    onEnded?: () => void
  ): Promise<void> {
    // If already playing this item, toggle stop
    if (this.currentPlayingId === playingId) {
      this.stop();
      return;
    }

    // Stop any existing sound first
    this.stop();
    this.currentPlayingId = playingId;
    if (onEnded) {
      this.onEndCallbacks.add(onEnded);
    }

    const cleanText = sanitizeTextForSpeech(text).trim();
    if (!cleanText) {
      this.stop();
      return;
    }

    // Case 0: Direct Audio URL or Imported Real Voice Track
    if (
      voice.startsWith("url:") ||
      voice.startsWith("data:") ||
      voice.startsWith("blob:") ||
      voice.startsWith("http") ||
      voice.startsWith("/api/custom-audio/")
    ) {
      const actualUrl = voice.startsWith("url:") ? voice.replace(/^url:/, "") : voice;
      this.playDirectUrl(actualUrl, speed, volume, playingId);
      return;
    }

    // Case 1: Explicit Browser / Web Speech voice requested
    if (voice.startsWith("browser:") || voice.startsWith("web:")) {
      const voiceName = voice.replace(/^(browser:|web:)/, "");
      this.playWithBrowserVoice(cleanText, voiceName, speed, volume, playingId);
      return;
    }

    // Case 2: Standard studio voice requested via server
    const cacheKey = `${voice}_${cleanText.slice(0, 100)}`;
    let audioUrl = this.audioCache.get(cacheKey);

    try {
      if (!audioUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText, voice }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`TTS server error: ${res.status}`);
        }

        const blob = await res.blob();
        audioUrl = URL.createObjectURL(blob);
        this.audioCache.set(cacheKey, audioUrl);
      }

      // Check if user stopped while fetching
      if (this.currentPlayingId !== playingId) {
        return;
      }

      const audio = new Audio(audioUrl);
      audio.loop = false;
      this.activeAudio = audio;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));
      audio.volume = Math.max(0, Math.min(1.0, volume));
      // The voice is heard through the echo chain, exactly like the video
      this.attachEcho(audio);

      audio.onended = () => {
        if (this.currentPlayingId === playingId) {
          this.stop();
        }
      };

      audio.onerror = (e) => {
        console.warn("Audio element error, falling back to speech synthesis:", e);
        this.fallbackSpeechSynthesis(cleanText, voice, speed, volume, playingId);
      };

      await audio.play();
    } catch (err) {
      console.warn("Server TTS fetch failed, using browser speech synthesis fallback:", err);
      this.fallbackSpeechSynthesis(cleanText, voice, speed, volume, playingId);
    }
  }

  // Plays a direct audio URL or blob URL (e.g., imported real voice track or live recording)
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
      audio.volume = Math.max(0, Math.min(1.0, volume));
      // Imported / prepared voice tracks get the same treatment as the voices
      this.attachEcho(audio);

      audio.onended = () => {
        if (this.currentPlayingId === playingId) {
          this.stop();
        }
      };

      audio.onerror = () => {
        this.stop();
      };

      await audio.play();
    } catch {
      this.stop();
    }
  }

  // Plays a specific voice from the browser's SpeechSynthesis voice list
  public playWithBrowserVoice(
    text: string,
    voiceName: string,
    speed: number,
    volume: number,
    playingId: string | number
  ) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.stop();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.max(0.5, Math.min(2.0, speed));
      utterance.volume = Math.max(0, Math.min(1.0, volume));

      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(
        (v) => v.name.toLowerCase() === voiceName.toLowerCase() || v.voiceURI.toLowerCase() === voiceName.toLowerCase()
      );

      if (match) {
        utterance.voice = match;
      }

      utterance.onend = () => {
        if (this.currentPlayingId === playingId) {
          this.stop();
        }
      };

      utterance.onerror = () => {
        this.stop();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      this.stop();
    }
  }

  // Fallback synthesis ensuring male voices are NEVER spoken by a high-pitch female voice
  private fallbackSpeechSynthesis(
    text: string,
    voiceId: string,
    speed: number,
    volume: number,
    playingId: string | number
  ) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.stop();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.max(0.5, Math.min(2.0, speed));
      utterance.volume = Math.max(0, Math.min(1.0, volume));

      const canonicalId = canonicalVoiceId(voiceId);
      const isMale = isMaleVoiceIdentifier(voiceId);
      const isIrish =
        canonicalId.includes("sentinel") ||
        canonicalId.includes("connor") ||
        canonicalId.includes("ie");
      const isBritish =
        voiceId === "fable" ||
        canonicalId.includes("gb") ||
        canonicalId.includes("ryan") ||
        canonicalId.includes("naturalist") ||
        canonicalId.includes("raconteur") ||
        canonicalId.includes("sovereign");
      const isAustralian =
        voiceId === "onyx" ||
        canonicalId.includes("au") ||
        canonicalId.includes("william") ||
        canonicalId.includes("enigma") ||
        canonicalId.includes("natasha");

      // Set pitch to match each persona's described delivery
      const lowerVoice = canonicalId;
      if (lowerVoice.includes("titan")) {
        utterance.pitch = 0.65; // Booming thunderous bass (The Titan)
      } else if (lowerVoice.includes("storyteller")) {
        utterance.pitch = 0.70; // Deep resonant gravelly rumble (The Storyteller)
      } else if (lowerVoice.includes("sentinel")) {
        utterance.pitch = 0.78; // Deep authoritative Irish baritone (The Sentinel)
      } else if (lowerVoice.includes("christopher")) {
        utterance.pitch = 0.72; // Deep authoritative cinematic rumble
      } else if (lowerVoice.includes("firebrand")) {
        utterance.pitch = 0.88; // Punchy energetic delivery
      } else if (lowerVoice.includes("investigator")) {
        utterance.pitch = 0.88; // Smoky grounded female documentary authority
      } else if (lowerVoice.includes("enigma")) {
        utterance.pitch = 0.90; // Velvety sophisticated Australian tone
      } else if (lowerVoice.includes("sovereign")) {
        utterance.pitch = 0.94; // Stately regal British dame
      } else if (lowerVoice.includes("confidante")) {
        utterance.pitch = 1.05; // Radiant smiling warmth
      } else if (isMale) {
        utterance.pitch = 0.84; // Natural masculine lower register
      } else if (lowerVoice.includes("aria")) {
        utterance.pitch = 1.08; // Energetic bright female
      } else {
        utterance.pitch = 1.0;
      }

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // First filter by target accent/language
        let candidates = voices.filter((v) => {
          if (isIrish) return v.lang.toLowerCase().includes("ie");
          if (isBritish) return v.lang.toLowerCase().includes("gb");
          if (isAustralian) return v.lang.toLowerCase().includes("au");
          return v.lang.toLowerCase().includes("en");
        });

        if (candidates.length === 0 && isIrish) {
          // If no specific IE voice, prefer GB male or EN male with Irish pitch
          candidates = voices.filter((v) => v.lang.toLowerCase().includes("gb") || v.lang.toLowerCase().startsWith("en"));
        } else if (candidates.length === 0) {
          candidates = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
        }
        if (candidates.length === 0) {
          candidates = voices;
        }

        // Now filter by gender match
        const targetGender = isMale ? "male" : "female";
        const genderMatch = candidates.find((v) => detectVoiceGenderFromName(v.name) === targetGender);

        if (genderMatch) {
          utterance.voice = genderMatch;
        } else if (candidates.length > 0) {
          utterance.voice = candidates[0];
          // If forced to use female voice for male role, deepen the pitch even further
          if (isMale) {
            utterance.pitch = 0.76;
          }
        }
      }

      utterance.onend = () => {
        if (this.currentPlayingId === playingId) {
          this.stop();
        }
      };

      utterance.onerror = () => {
        this.stop();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      this.stop();
    }
  }
}

export const ttsPlayer = new TTSAudioPlayer();
