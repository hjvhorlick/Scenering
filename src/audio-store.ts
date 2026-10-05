import { env } from "./env";

export const audioStore = {
  async upload(userId: string, audioId: string, base64Data: string, mimeType: string): Promise<string> {
    try {
      const bucket = (env() as any).AUDIO_BUCKET;
      if (!bucket) throw new Error("Audio storage is unavailable");

      const db = env().DB;
      const countRow = await db.prepare("SELECT COUNT(*) as count FROM audio_files WHERE user_id = ?").bind(userId).first();
      const count = (countRow as any)?.count ?? 0;
      if (count >= 5) {
        const oldest = await db.prepare("SELECT id, r2_key FROM audio_files WHERE user_id = ? ORDER BY created_at ASC LIMIT 1").bind(userId).first();
        if (oldest) {
          try {
            await bucket.delete((oldest as any).r2_key);
          } catch (error) {
            console.warn("Unable to remove the oldest audio object:", error);
          }
          await db.prepare("DELETE FROM audio_files WHERE id = ?").bind((oldest as any).id).run();
        }
      }
      const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const r2Key = `audio/${userId}/${audioId}`;
      await bucket.put(r2Key, bytes, { httpMetadata: { contentType: mimeType } });
      await db.prepare("INSERT INTO audio_files (id, user_id, filename, r2_key, size_bytes, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(audioId, userId, audioId, r2Key, bytes.length, mimeType, new Date().toISOString()).run();
      return audioId;
    } catch (error) {
      console.warn("Audio upload unavailable:", error);
      throw new Error("Audio storage is unavailable");
    }
  },
  async get(audioId: string): Promise<{ body: ReadableStream; mimeType: string } | null> {
    try {
      const bucket = (env() as any).AUDIO_BUCKET;
      if (!bucket) return null;

      const meta = await env().DB.prepare("SELECT r2_key, mime_type FROM audio_files WHERE id = ?").bind(audioId).first();
      if (!meta) return null;
      const object = await bucket.get((meta as any).r2_key);
      if (!object) return null;
      return { body: object.body, mimeType: (meta as any).mime_type };
    } catch (error) {
      console.warn("Unable to load audio object:", error);
      return null;
    }
  },
  async listByUser(userId: string): Promise<any[]> {
    const result = await env().DB.prepare("SELECT * FROM audio_files WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
    return result.results || [];
  },
  async cleanupExpired(): Promise<void> {
    try {
      const bucket = (env() as any).AUDIO_BUCKET;
      if (!bucket) return;

      const expired = await env().DB.prepare("SELECT id, r2_key FROM audio_files WHERE created_at < datetime('now', '-24 hours')").all();
      for (const row of expired.results || []) {
        try {
          await bucket.delete((row as any).r2_key);
        } catch (error) {
          console.warn("Unable to remove expired audio object:", error);
        }
        await env().DB.prepare("DELETE FROM audio_files WHERE id = ?").bind((row as any).id).run();
      }
    } catch (error) {
      // Storage is optional. A missing binding must not make the scheduled
      // Worker invocation fail or bring down the rest of the application.
      console.warn("Audio cleanup unavailable:", error);
    }
  },
};
