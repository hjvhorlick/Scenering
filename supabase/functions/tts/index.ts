const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VOICES = [
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

// Generate SSML marks for word boundaries
function generateSSML(text: string, voice: string, rate: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
    <voice name="${voice}">
      <prosody rate="${rate}">
        ${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
      </prosody>
    </voice>
  </speak>`;
}

async function synthesizeTTS(text: string, voice: string, rate: string): Promise<ArrayBuffer> {
  const ssml = generateSSML(text, voice, rate);

  const params = new URLSearchParams({
    trustedclienttoken: "6A5AA1D4EAFF4E9FB37E23D68491D6F4",
  });

  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?${params}`;

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let resolved = false;

    const ws = new WebSocket(wsUrl);

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      // Send configuration message
      const configMessage = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`;
      ws.send(configMessage);

      // Send SSML
      const ssmlMessage = `X-RequestId:${Date.now()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}\r\n`;
      ws.send(ssmlMessage);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary audio data — first 2 bytes are the path length header
        const view = new DataView(event.data);
        const pathLen = view.getUint16(0);
        const audioData = new Uint8Array(event.data, 2 + pathLen);
        if (audioData.length > 0) {
          chunks.push(audioData);
        }
      } else if (typeof event.data === "string") {
        // Text message — check for turn.end
        if (event.data.includes("Path:turn.end")) {
          if (!resolved) {
            resolved = true;
            const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
            const merged = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of chunks) {
              merged.set(chunk, offset);
              offset += chunk.length;
            }
            ws.close();
            resolve(merged.buffer);
          }
        }
      }
    };

    ws.onerror = (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error("WebSocket error during TTS synthesis"));
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        resolved = true;
        if (chunks.length > 0) {
          const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(merged.buffer);
        } else {
          reject(new Error("WebSocket closed without audio data"));
        }
      }
    };

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { ws.close(); } catch {}
        reject(new Error("TTS synthesis timed out"));
      }
    }, 30000);
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({ voices: VOICES }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { text, voice = "en-US-ChristopherNeural" } = body;

      if (!text || typeof text !== "string") {
        return new Response(
          JSON.stringify({ error: "Text is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const trimmedText = text.slice(0, 2000);
      const audioBuffer = await synthesizeTTS(trimmedText, voice, "-5%");

      return new Response(audioBuffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to generate speech" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
