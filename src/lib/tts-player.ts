// Audio Player & TTS Service for Scenering Studio
// Provides high-fidelity MP3 voiceover playback via /api/tts with intelligent caching and fallback

class TTSAudioPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private audioCache = new Map<string, string>(); // key -> blobUrl
  private currentPlayingId: string | number | null = null;
  private onEndCallbacks = new Set<() => void>();

  public getCurrentPlayingId(): string | number | null {
    return this.currentPlayingId;
  }

  public stop() {
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
    voice: string = "alloy",
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

    const cleanText = text.trim();
    if (!cleanText) {
      this.stop();
      return;
    }

    const cacheKey = `${voice}_${cleanText.slice(0, 100)}`;
    let audioUrl = this.audioCache.get(cacheKey);

    try {
      if (!audioUrl) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText, voice }),
        });

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
      this.activeAudio = audio;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));
      audio.volume = Math.max(0, Math.min(1.0, volume));

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

  private fallbackSpeechSynthesis(
    text: string,
    voice: string,
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
      utterance.rate = speed;
      utterance.volume = volume;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const isBritish = voice === "fable" || voice.includes("GB") || voice.includes("Ryan");
        const isAustralian = voice === "onyx" || voice.includes("AU") || voice.includes("William");
        const match = voices.find((v) => {
          if (isBritish) return v.lang.includes("en-GB");
          if (isAustralian) return v.lang.includes("en-AU");
          return v.lang.includes("en-US");
        }) || voices[0];
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
}

export const ttsPlayer = new TTSAudioPlayer();
