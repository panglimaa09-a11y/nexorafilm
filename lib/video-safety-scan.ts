export type VideoSafetyDecision = "safe" | "blocked" | "review" | "unavailable";

export async function scanCreatorVideo(input: {
  videoUrl: string;
  videoId: string;
  title: string;
  description: string | null;
}): Promise<{ decision: VideoSafetyDecision; provider: string; result: Record<string, unknown>; note: string }> {
  const endpoint = process.env.VIDEO_MODERATION_API_URL?.trim();
  const apiKey = process.env.VIDEO_MODERATION_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    return {
      decision: "unavailable",
      provider: "not-configured",
      result: { reason: "VIDEO_MODERATION_API_URL or VIDEO_MODERATION_API_KEY is missing" },
      note: "Pemindaian otomatis belum dikonfigurasi; video ditahan untuk pemeriksaan admin.",
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        video_url: input.videoUrl,
        video_id: input.videoId,
        title: input.title,
        description: input.description ?? "",
        task: "video_safety_moderation",
        required_checks: ["sexual_exploitation", "nudity", "graphic_violence", "self_harm", "hate", "dangerous_acts", "illegal_activity"],
      }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        decision: "unavailable",
        provider: new URL(endpoint).host,
        result: { http_status: response.status },
        note: "Layanan pemindaian tidak tersedia; video ditahan untuk pemeriksaan admin.",
      };
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") {
      return { decision: "review", provider: new URL(endpoint).host, result: { invalid_response: true }, note: "Hasil pemindaian tidak valid; perlu review manual." };
    }

    const data = payload as Record<string, unknown>;
    const raw = String(data.decision ?? data.status ?? "").toLowerCase();
    const decision: VideoSafetyDecision =
      ["safe", "allow", "approved", "clean"].includes(raw) ? "safe" :
      ["blocked", "unsafe", "reject", "rejected"].includes(raw) ? "blocked" :
      ["review", "flagged", "needs_review"].includes(raw) ? "review" : "review";

    const safeResult: Record<string, unknown> = {
      decision,
      categories: data.categories ?? data.flags ?? null,
      provider_reference: typeof data.id === "string" ? data.id : null,
    };

    const note = decision === "safe"
      ? "Pemindaian otomatis tidak menemukan pelanggaran yang terdeteksi; pemeriksaan admin tetap diperlukan."
      : decision === "blocked"
        ? "Pemindaian otomatis menandai konten sebagai berisiko. Publikasi diblokir."
        : "Konten memerlukan pemeriksaan manual sebelum dapat diterbitkan.";

    return { decision, provider: new URL(endpoint).host, result: safeResult, note };
  } catch {
    return {
      decision: "unavailable",
      provider: (() => { try { return new URL(endpoint).host; } catch { return "configured-provider"; } })(),
      result: { scan_failed: true },
      note: "Pemindaian gagal atau timeout; video ditahan untuk pemeriksaan admin.",
    };
  }
}
