import { NextRequest, NextResponse } from "next/server";
import { EdgeTTS } from "node-edge-tts";

// Server-side TTS using Microsoft Edge's free TTS service
// Generates MP3 audio from text - no API key needed
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voice = "en-US-ChristopherNeural" } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // Limit text length
    const trimmedText = text.slice(0, 2000);

    const tts = new EdgeTTS({
      voice,
      lang: "en-US",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      rate: "-5%", // Slightly slower for narration clarity
      volume: "+0%",
    });

    // Generate audio to a temp file, then read it
    const tmpFile = `/tmp/tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`;
    await tts.ttsPromise(trimmedText, tmpFile);

    const fs = await import("fs");
    const audioBuffer = fs.readFileSync(tmpFile);

    // Clean up temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(audioBuffer.length),
      },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}

// List available voices
export async function GET() {
  const voices = [
    { id: "en-US-ChristopherNeural", name: "Christopher (Male)", lang: "en-US" },
    { id: "en-US-AriaNeural", name: "Aria (Female)", lang: "en-US" },
    { id: "en-US-GuyNeural", name: "Guy (Male)", lang: "en-US" },
    { id: "en-US-JennyNeural", name: "Jenny (Female)", lang: "en-US" },
    { id: "en-US-EricNeural", name: "Eric (Male)", lang: "en-US" },
    { id: "en-US-MichelleNeural", name: "Michelle (Female)", lang: "en-US" },
    { id: "en-US-RogerNeural", name: "Roger (Male)", lang: "en-US" },
    { id: "en-US-SteffanNeural", name: "Steffan (Male)", lang: "en-US" },
    { id: "en-GB-RyanNeural", name: "Ryan (Male, British)", lang: "en-GB" },
    { id: "en-GB-SoniaNeural", name: "Sonia (Female, British)", lang: "en-GB" },
    { id: "en-AU-WilliamNeural", name: "William (Male, Australian)", lang: "en-AU" },
    { id: "en-AU-NatashaNeural", name: "Natasha (Female, Australian)", lang: "en-AU" },
  ];

  return NextResponse.json({ voices });
}
