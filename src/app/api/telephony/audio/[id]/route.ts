import { getAudio, getAudioFromCdn } from "@/lib/telephony/audio-cache";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cleanId = id?.replace(/\.wav$/i, "");
    if (!cleanId || !/^[a-zA-Z0-9_-]{8,64}$/.test(cleanId)) {
      return new Response("Invalid audio identifier", { status: 400 });
    }
    let cached = getAudio(cleanId);
    if (!cached) {
      // Async Tier 3 fallback: Fetch from Supabase Storage CDN
      cached = await getAudioFromCdn(cleanId);
    }

    if (!cached) {
      console.warn(`[Telephony Audio] 404 - Audio not found or expired for ID: ${cleanId}`);
      return new Response("Audio not found or expired", { status: 404 });
    }

    const userAgent = req.headers.get("user-agent") || "unknown";
    console.log(
      `[Telephony Audio] 200 OK - Serving ${cleanId}.wav (${cached.buffer.length} bytes, ${cached.contentType}) to ${userAgent}`
    );

    return new Response(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType || "audio/wav",
        "Content-Length": cached.buffer.length.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[Telephony Audio] 500 error serving audio:", err);
    return new Response("Internal error", { status: 500 });
  }
}

export async function HEAD(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cleanId = id?.replace(/\.wav$/i, "");
    if (!cleanId || !/^[a-zA-Z0-9_-]{8,64}$/.test(cleanId)) {
      return new Response(null, { status: 400 });
    }
    let cached = getAudio(cleanId);
    if (!cached) {
      cached = await getAudioFromCdn(cleanId);
    }

    if (!cached) {
      return new Response(null, { status: 404 });
    }

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType || "audio/wav",
        "Content-Length": cached.buffer.length.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
