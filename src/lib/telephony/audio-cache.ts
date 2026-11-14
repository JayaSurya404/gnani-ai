import fs from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";

interface CachedAudio {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

export interface PrewarmedSessionAudio {
  audioId: string;
  text: string;
  language: string;
  expiresAt: number;
}

const AUDIO_CACHE_DIR = path.join(process.cwd(), ".audio-cache");

// Ensure cache directory exists on disk for multi-instance / cross-process sharing
try {
  if (!fs.existsSync(AUDIO_CACHE_DIR)) {
    fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
  }
} catch {
  // Safe ignore in restricted environments
}

// Global in-memory cache surviving Next.js route invocations via globalThis
interface GlobalAudioRegistry {
  audioCache: Map<string, CachedAudio>;
  sessionAudioMap: Map<string, PrewarmedSessionAudio>;
}

declare global {
  var __vn_audio_registry: GlobalAudioRegistry | undefined;
}

const registry: GlobalAudioRegistry = globalThis.__vn_audio_registry || {
  audioCache: new Map<string, CachedAudio>(),
  sessionAudioMap: new Map<string, PrewarmedSessionAudio>(),
};

if (!globalThis.__vn_audio_registry) {
  globalThis.__vn_audio_registry = registry;
}

const globalAudioCache = registry.audioCache;
const sessionAudioMap = registry.sessionAudioMap;

export function storeAudio(id: string, buffer: Buffer, contentType = "audio/wav", ttlMs = 15 * 60 * 1000): void {
  // Validate ID format: alphanumeric, underscore, or hyphen only
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    return;
  }

  // Prune expired items
  const now = Date.now();
  for (const [key, item] of globalAudioCache.entries()) {
    if (now > item.expiresAt) {
      globalAudioCache.delete(key);
    }
  }

  // Tier 1: In-memory global cache
  globalAudioCache.set(id, {
    buffer,
    contentType,
    expiresAt: now + ttlMs,
  });

  // Tier 2: Persistent shared disk cache
  try {
    const safePath = path.resolve(AUDIO_CACHE_DIR, `${id}.wav`);
    if (safePath.startsWith(path.resolve(AUDIO_CACHE_DIR))) {
      fs.writeFileSync(safePath, buffer);
    }
  } catch (err) {
    console.warn("[AudioCache] Disk persist error:", err);
  }

  // Tier 3: Asynchronously upload to Supabase Storage CDN for direct carrier playback
  uploadAudioToCdn(id, buffer).catch((cdnErr) => {
    console.warn(`[AudioCache] Background CDN sync note for ${id}:`, cdnErr);
  });
}

/**
 * Uploads audio buffer to Supabase Storage public CDN bucket ('telephony-audio').
 * Returns the public HTTPS URL if successful, or null on failure.
 */
export async function uploadAudioToCdn(id: string, buffer: Buffer): Promise<string | null> {
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) return null;
  try {
    const supabase = createAdminClient();
    if (!supabase) return null;
    const fileName = `${id}.wav`;
    const { error } = await supabase.storage.from("telephony-audio").upload(fileName, buffer, {
      contentType: "audio/wav",
      upsert: true,
    });
    if (error) {
      console.warn(`[AudioCache] CDN upload error for ${id}:`, error.message);
      return null;
    }
    const { data } = supabase.storage.from("telephony-audio").getPublicUrl(fileName);
    return data?.publicUrl || null;
  } catch (err) {
    console.warn(`[AudioCache] CDN upload exception for ${id}:`, err);
    return null;
  }
}

/**
 * Retrieves audio from Supabase Storage CDN if missing from local memory/disk cache.
 */
export async function getAudioFromCdn(id: string): Promise<CachedAudio | null> {
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) return null;
  try {
    const supabase = createAdminClient();
    if (!supabase) return null;
    const fileName = `${id}.wav`;
    const { data, error } = await supabase.storage.from("telephony-audio").download(fileName);
    if (error || !data) return null;
    const arrayBuf = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const cached: CachedAudio = {
      buffer,
      contentType: "audio/wav",
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    globalAudioCache.set(id, cached);
    return cached;
  } catch {
    return null;
  }
}

/**
 * Resolves the primary audio URL for Twilio <Play>.
 * Prioritizes the local in-memory audio gateway (${appUrl}/api/telephony/audio/${id}.wav)
 * for immediate zero-latency carrier delivery, avoiding Cloudflare CDN edge replication 404s
 * on newly synthesized live-turn audio chunks.
 */
export function getPublicAudioUrl(id: string, appUrl: string): string {
  if (appUrl && appUrl.startsWith("http")) {
    return `${appUrl}/api/telephony/audio/${id}.wav`;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && supabaseUrl.startsWith("http")) {
    return `${supabaseUrl}/storage/v1/object/public/telephony-audio/${id}.wav`;
  }
  return `/api/telephony/audio/${id}.wav`;
}

export function getAudio(id: string): CachedAudio | null {
  // Validate ID format to prevent traversal or invalid identifiers
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    return null;
  }

  // Tier 1: In-memory
  const item = globalAudioCache.get(id);
  if (item && Date.now() <= item.expiresAt) {
    return item;
  }

  // Tier 2: Shared disk storage
  try {
    const safePath = path.resolve(AUDIO_CACHE_DIR, `${id}.wav`);
    if (safePath.startsWith(path.resolve(AUDIO_CACHE_DIR)) && fs.existsSync(safePath)) {
      const stat = fs.statSync(safePath);
      // Valid if created within last 30 minutes
      if (Date.now() - stat.mtimeMs < 30 * 60 * 1000) {
        const buffer = fs.readFileSync(safePath);
        const cached: CachedAudio = {
          buffer,
          contentType: "audio/wav",
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        globalAudioCache.set(id, cached);
        return cached;
      }
    }
  } catch (err) {
    console.warn("[AudioCache] Disk read error:", err);
  }

  return null;
}

export function storeSessionAudio(
  sessionId: string,
  audioId: string,
  text: string,
  language: string,
  ttlMs = 15 * 60 * 1000
): void {
  const now = Date.now();
  for (const [key, item] of sessionAudioMap.entries()) {
    if (now > item.expiresAt) {
      sessionAudioMap.delete(key);
    }
  }

  const payload: PrewarmedSessionAudio = {
    audioId,
    text,
    language,
    expiresAt: now + ttlMs,
  };

  sessionAudioMap.set(sessionId, payload);

  // Persist session metadata to disk for cross-instance lookup
  try {
    const metaPath = path.join(AUDIO_CACHE_DIR, `${sessionId}.json`);
    fs.writeFileSync(metaPath, JSON.stringify(payload));
  } catch (err) {
    console.warn("[AudioCache] Session meta disk persist error:", err);
  }
}

export function getSessionAudio(sessionId: string): PrewarmedSessionAudio | null {
  const item = sessionAudioMap.get(sessionId);
  if (item && Date.now() <= item.expiresAt) {
    return item;
  }

  // Read from shared disk storage
  try {
    const metaPath = path.join(AUDIO_CACHE_DIR, `${sessionId}.json`);
    if (fs.existsSync(metaPath)) {
      const data = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as PrewarmedSessionAudio;
      if (Date.now() <= data.expiresAt) {
        sessionAudioMap.set(sessionId, data);
        return data;
      }
    }
  } catch (err) {
    console.warn("[AudioCache] Session meta disk read error:", err);
  }

  return null;
}


