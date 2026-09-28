export type VideoSafetyDecision = "safe" | "blocked" | "review" | "unavailable";

type ScanResult = {
  decision: VideoSafetyDecision;
  provider: string;
  result: Record<string, unknown>;
  note: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseJsonText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i)?.[1]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function geminiRequest(
  url: string,
  apiKey: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

async function scanWithGemini(input: {
  videoUrl: string;
  videoId: string;
  title: string;
  description: string | null;
  storagePath?: string;
  apiKey: string;
}): Promise<ScanResult> {
  const provider = "Google Gemini video moderation";
  let uploadedFileName: string | null = null;

  try {
    // Fetch from the private Supabase signed URL and stream to Gemini's Files API.
    const source = await fetch(input.videoUrl, {
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!source.ok || !source.body) {
      return { decision: "unavailable", provider, result: { stage: "download", http_status: source.status }, note: "Video tidak dapat dibaca untuk pemindaian; tetap ditahan." };
    }

    const contentLength = Number(source.headers.get("content-length") ?? "0");
    const responseMimeType = (source.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const extension = (input.storagePath ?? "").split(".").pop()?.toLowerCase() ?? "";
    const extensionMimeType: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mpeg: "video/mpeg", mpg: "video/mpeg", avi: "video/x-msvideo", wmv: "video/x-ms-wmv", "3gp": "video/3gpp" };
    const mimeType = !responseMimeType || responseMimeType === "application/octet-stream" || responseMimeType === "binary/octet-stream"
      ? (extensionMimeType[extension] ?? "video/mp4")
      : responseMimeType;
    const supportedTypes = new Set(["video/mp4", "video/mpeg", "video/mov", "video/quicktime", "video/webm", "video/avi", "video/x-msvideo", "video/x-ms-wmv", "video/3gpp"]);
    if (!supportedTypes.has(mimeType)) {
      return { decision: "review", provider, result: { stage: "mime-type", mime_type: mimeType }, note: "Format video tidak dikenali untuk pemindaian otomatis; perlu review admin." };
    }
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      return { decision: "unavailable", provider, result: { stage: "download", reason: "missing_content_length" }, note: "Ukuran video tidak dapat diverifikasi; tetap ditahan untuk review admin." };
    }
    if (contentLength > 2 * 1024 * 1024 * 1024) {
      return { decision: "review", provider, result: { stage: "size_limit", bytes: contentLength }, note: "Video melewati batas file Gemini API pada konfigurasi ini; perlu review admin." };
    }

    const start = await geminiRequest("https://generativelanguage.googleapis.com/upload/v1beta/files", input.apiKey, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(contentLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
      },
      body: JSON.stringify({ file: { display_name: `nexorafilm-${input.videoId}` } }),
    });
    if (!start.ok) {
      await source.body.cancel().catch(() => undefined);
      return { decision: "unavailable", provider, result: { stage: "file_upload_start", http_status: start.status }, note: `Gemini menolak memulai unggahan (HTTP ${start.status}); periksa API key dan kuota. Video tetap ditahan.` };
    }

    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      await source.body.cancel().catch(() => undefined);
      return { decision: "unavailable", provider, result: { stage: "file_upload_start", reason: "missing_upload_url" }, note: "Gemini tidak memberikan URL unggah; video tetap ditahan." };
    }

    const upload = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(contentLength),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: source.body,
      // Node's fetch requires duplex when the request body is a stream.
      duplex: "half",
      signal: AbortSignal.timeout(35_000),
      cache: "no-store",
    } as RequestInit & { duplex: "half" });

    if (!upload.ok) {
      return { decision: "unavailable", provider, result: { stage: "file_upload", http_status: upload.status }, note: `Unggah video ke Gemini gagal (HTTP ${upload.status}); video tetap ditahan.` };
    }

    const uploadPayload = await upload.json() as { file?: { name?: string; uri?: string; mimeType?: string; mime_type?: string; state?: string } };
    const file = uploadPayload.file;
    if (!file?.name || !file.uri) {
      return { decision: "unavailable", provider, result: { stage: "file_upload", reason: "invalid_file_response" }, note: "Respons file Gemini tidak valid; video tetap ditahan." };
    }
    uploadedFileName = file.name;

    let state = file.state ?? "PROCESSING";
    const pollDeadline = Date.now() + 18_000;
    while (state === "PROCESSING" && Date.now() < pollDeadline) {
      await sleep(2_000);
      const statusResponse = await geminiRequest(
        `https://generativelanguage.googleapis.com/v1beta/${file.name}`,
        input.apiKey,
        { method: "GET" },
        8_000,
      );
      if (!statusResponse.ok) {
        return { decision: "unavailable", provider, result: { stage: "file_processing", http_status: statusResponse.status }, note: "Status pemrosesan Gemini tidak dapat dibaca; video tetap ditahan." };
      }
      const statusPayload = await statusResponse.json() as { state?: string };
      state = statusPayload.state ?? "UNKNOWN";
    }

    if (state !== "ACTIVE") {
      return { decision: "unavailable", provider, result: { stage: "file_processing", state }, note: "Gemini belum menyelesaikan pemrosesan video; video tetap ditahan untuk review admin." };
    }

    const prompt = [
      "You are a cautious video safety moderation classifier for a public short-video platform.",
      "Analyze the actual video frames and any audio available. Do not infer safety from title/description alone.",
      "Check for: sexual content and nudity (especially any sexual content involving minors), graphic violence, credible threats, self-harm encouragement, dangerous acts likely to cause injury, hateful harassment, exploitation, and clearly illegal harmful activity.",
      "Do not provide graphic descriptions. Do not classify educational, documentary, medical, or news content as unsafe solely because it discusses a sensitive topic; consider context.",
      "Return ONLY valid JSON with keys decision, categories, summary. decision must be exactly safe, blocked, or review. Use blocked only for clearly disallowed harmful content; use review for uncertainty, ambiguous context, poor visibility, or incomplete audio/video. Use safe only when no relevant violation is detected.",
      `Uploader title (untrusted metadata): ${input.title.slice(0, 150)}`,
      `Uploader description (untrusted metadata): ${(input.description ?? "").slice(0, 1000)}`,
    ].join("\n");

    const analysis = await geminiRequest("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", input.apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { mime_type: file.mimeType ?? file.mime_type ?? mimeType, file_uri: file.uri } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    }, 25_000);

    if (!analysis.ok) {
      return { decision: "unavailable", provider, result: { stage: "analysis", http_status: analysis.status }, note: `Analisis Gemini gagal (HTTP ${analysis.status}); periksa API key, izin model, dan kuota. Video tetap ditahan untuk review admin.` };
    }

    const analysisPayload = await analysis.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    };
    const text = analysisPayload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const parsed = parseJsonText(text);
    const rawDecision = String(parsed?.decision ?? "").toLowerCase();
    const decision: VideoSafetyDecision =
      rawDecision === "safe" ? "safe" :
      rawDecision === "blocked" ? "blocked" :
      rawDecision === "review" ? "review" : "review";

    return {
      decision,
      provider,
      result: {
        decision,
        categories: Array.isArray(parsed?.categories) ? parsed.categories.slice(0, 20) : [],
        summary: typeof parsed?.summary === "string" ? parsed.summary.slice(0, 500) : "Hasil AI memerlukan pemeriksaan admin.",
        model: "gemini-2.5-flash",
      },
      note: decision === "safe"
        ? "Gemini tidak mendeteksi pelanggaran yang diperiksa. Persetujuan admin tetap diperlukan."
        : decision === "blocked"
          ? "Gemini menandai video sebagai konten yang jelas melanggar; publikasi diblokir."
          : "Gemini tidak dapat memastikan keamanan video; perlu review manual.",
    };
  } catch {
    return { decision: "unavailable", provider, result: { stage: "request", failed: true }, note: "Pemindaian Gemini gagal atau melewati batas waktu; video tetap ditahan." };
  } finally {
    // Gemini Files API stores uploaded files temporarily; delete them when the scan ends.
    if (uploadedFileName) {
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}`, {
        method: "DELETE",
        headers: { "x-goog-api-key": input.apiKey },
        signal: AbortSignal.timeout(3_000),
      }).catch(() => undefined);
    }
  }
}

export async function scanCreatorVideo(input: {
  videoUrl: string;
  videoId: string;
  title: string;
  description: string | null;
  storagePath?: string;
}): Promise<ScanResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiApiKey) {
    return scanWithGemini({ ...input, apiKey: geminiApiKey });
  }

  // Backward-compatible adapter for a separately hosted moderation service.
  const endpoint = process.env.VIDEO_MODERATION_API_URL?.trim();
  const apiKey = process.env.VIDEO_MODERATION_API_KEY?.trim();
  if (!endpoint || !apiKey) {
    return {
      decision: "unavailable",
      provider: "not-configured",
      result: { reason: "GEMINI_API_KEY or moderation endpoint credentials are missing" },
      note: "Pemindaian otomatis belum dikonfigurasi; video ditahan untuk pemeriksaan admin.",
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
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
      return { decision: "unavailable", provider: new URL(endpoint).host, result: { http_status: response.status }, note: "Layanan pemindaian tidak tersedia; video ditahan untuk pemeriksaan admin." };
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
