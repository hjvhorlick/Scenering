import { env } from "./env";

export const audioStore = {
  async upload(userId: string, audioId: string, base64Data: string, mimeType: string): Promise<string> {
    const bucket = env().AUDIO_BUCKET;
    const db = env().DB;
    const countRow = await db.prepare("SELECT COUNT(*) as count FROM audio_files WHERE user_id = ?").bind(userId).first();
    const count = (countRow as any)?.count ?? 0;
    if (count >= 5) {
      const oldest = await db.prepare("SELECT id, r2_key FROM audio_files WHERE user_id = ? ORDER BY created_at ASC LIMIT 1").bind(userId).first();
      if (oldest) {
        await bucket.delete((oldest as any).r2_key);
        await db.prepare("DELETE FROM audio_files WHERE id = ?").bind((oldest as any).id).run();
      }
    }
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const r2Key = `audio/${userId}/${audioId}`;
    await bucket.put(r2Key, bytes, { httpMetadata: { contentType: mimeType } });
    await db.prepare("INSERT INTO audio_files (id, user_id, filename, r2_key, size_bytes, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(audioId, userId, audioId, r2Key, bytes.length, mimeType, new Date().toISOString()).run();
    return audioId;
  },
  async get(audioId: string): Promise<{ body: ReadableStream; mimeType: string } | null> {
    const meta = await env().DB.prepare("SELECT r2_key, mime_type FROM audio_files WHERE id = ?").bind(audioId).first();
    if (!meta) return null;
    const object = await env().AUDIO_BUCKET.get((meta as any).r2_key);
    if (!object) return null;
    return { body: object.body, mimeType: (meta as any).mime_type };
  },
  async listByUser(userId: string): Promise<any[]> {
    const result = await env().DB.prepare("SELECT * FROM audio_files WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
    return result.results || [];
  },
  async cleanupExpired(): Promise<void> {
    const expired = await env().DB.prepare("SELECT id, r2_key FROM audio_files WHERE created_at < datetime('now', '-24 hours')").all();
    for (const row of expired.results || []) {
      await env().AUDIO_BUCKET.delete((row as any).r2_key);
      await env().DB.prepare("DELETE FROM audio_files WHERE id = ?").bind((row as any).id).run();
    }
  },
};
