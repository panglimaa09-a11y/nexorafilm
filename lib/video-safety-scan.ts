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


import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

async function runFfmpeg(args: string[]): Promise<{ stderr: string; failed: boolean }> {
  const binaryPath = ffmpegPath;
  if (!binaryPath) throw new Error("FFmpeg binary is unavailable in this deployment.");
  return new Promise((resolve) => {
    execFile(binaryPath, args, { timeout: 12_000, maxBuffer: 2 * 1024 * 1024 }, (error, _stdout, stderr) => {
      resolve({ stderr: String(stderr ?? ""), failed: Boolean(error) });
    });
  });
}

async function scanWithAtria(input: {
  videoUrl: string;
  videoId: string;
  title: string;
  description: string | null;
  apiKey: string;
}): Promise<ScanResult> {
  const provider = "Atria-Dawn-Preview";
  let workDir = "";
  try {
    const source = await fetch(input.videoUrl, { signal: AbortSignal.timeout(25_000), cache: "no-store" });
    if (!source.ok || !source.body) {
      return { decision: "unavailable", provider, result: { stage: "download", http_status: source.status }, note: `Video gagal diambil untuk scan (HTTP ${source.status}); tetap ditahan.` };
    }
    const declaredSize = Number(source.headers.get("content-length") ?? "0");
    const maxBytes = 100 * 1024 * 1024;
    if (declaredSize > maxBytes) {
      await source.body.cancel().catch(() => undefined);
      return { decision: "review", provider, result: { stage: "size_limit", max_bytes: maxBytes, bytes: declaredSize }, note: "Video lebih besar dari batas scan otomatis 100 MB; perlu review admin." };
    }
    const reader = source.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { decision: "review", provider, result: { stage: "size_limit", max_bytes: maxBytes }, note: "Video lebih besar dari batas scan otomatis 100 MB; perlu review admin." };
      }
      chunks.push(value);
    }
    if (!total) return { decision: "unavailable", provider, result: { stage: "download", reason: "empty_video" }, note: "File video kosong; tetap ditahan." };

    workDir = await mkdtemp(path.join(os.tmpdir(), "nexorafilm-atria-"));
    const videoPath = path.join(workDir, "source-video");
    await writeFile(videoPath, Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    const probe = await runFfmpeg(["-hide_banner", "-i", videoPath]);
    const durationMatch = probe.stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const duration = durationMatch
      ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
      : 0;
    if (!duration || !Number.isFinite(duration)) {
      return { decision: "review", provider, result: { stage: "frame_extraction", reason: "duration_unavailable" }, note: "Durasi video tidak dapat dibaca; perlu review admin." };
    }

    const frameCount = 6;
    const timestamps = Array.from({ length: frameCount }, (_, index) =>
      frameCount === 1 ? 0 : Math.min(Math.max(0, duration - 0.2), (duration * index) / (frameCount - 1)),
    );
    const frames: Array<{ type: "image_url"; image_url: { url: string; detail: "low" | "high" } }> = [];
    for (let index = 0; index < timestamps.length; index++) {
      const framePath = path.join(workDir, `frame-${index}.jpg`);
      const extracted = await runFfmpeg([
        "-hide_banner", "-loglevel", "error", "-ss", String(timestamps[index]),
        "-i", videoPath, "-frames:v", "1", "-vf", "scale=768:-1",
        "-q:v", "5", "-y", framePath,
      ]);
      if (extracted.failed) continue;
      try {
        const bytes = await readFile(framePath);
        if (bytes.length) frames.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${bytes.toString("base64")}`, detail: "low" } });
      } catch { /* Skip an unavailable sample; fail closed if all samples are missing. */ }
    }
    if (frames.length < 3) {
      return { decision: "review", provider, result: { stage: "frame_extraction", frames: frames.length }, note: "Sampel frame video tidak cukup untuk penilaian AI; perlu review admin." };
    }

    const baseUrl = (process.env.ATRIA_BASE_URL?.trim() || "https://api.atria-asi.ai/v1").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.ATRIA_MODEL?.trim() || "Atria-Dawn-Preview",
        temperature: 0,
        max_tokens: 700,
        messages: [
          { role: "system", content: "You are a cautious safety moderator. Review only the supplied sampled video frames and metadata. Never claim to have heard audio. Return only JSON: {decision:'safe'|'blocked'|'review',categories:string[],summary:string}. Use safe only when the visible sampled frames show no relevant violation; use blocked only for a clearly visible severe violation; use review for uncertainty, missing context, or anything that cannot be judged from sampled frames. Check sexual content/exploitation (especially involving minors), graphic violence, credible threats, self-harm encouragement, dangerous acts, hateful harassment, and clearly harmful illegal activity. Do not provide graphic descriptions." },
          { role: "user", content: [
            { type: "text", text: `Review these ${frames.length} frames sampled across the video duration (${Math.round(duration)} seconds). This is a partial visual sample, not full audio/video understanding. Title: ${input.title.slice(0, 150)}. Description: ${(input.description ?? "").slice(0, 1000)}. Return strict JSON with decision, categories, summary.` },
            ...frames,
          ] },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    if (!response.ok) {
      return { decision: "unavailable", provider, result: { stage: "analysis", http_status: response.status }, note: `Atria gagal menganalisis frame (HTTP ${response.status}); video tetap ditahan untuk review admin.` };
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const rawText = payload.choices?.[0]?.message?.content;
    const parsed = typeof rawText === "string" ? parseJsonText(rawText) : null;
    const rawDecision = String(parsed?.decision ?? "").toLowerCase();
    const decision: VideoSafetyDecision =
      rawDecision === "safe" ? "safe" :
      rawDecision === "blocked" ? "blocked" : "review";
    return {
      decision,
      provider,
      result: {
        decision,
        categories: Array.isArray(parsed?.categories) ? parsed.categories.slice(0, 20) : [],
        summary: typeof parsed?.summary === "string" ? parsed.summary.slice(0, 500) : "Hasil AI memerlukan pemeriksaan admin.",
        model: process.env.ATRIA_MODEL?.trim() || "Atria-Dawn-Preview",
        sampled_frames: frames.length,
        sampled_duration_seconds: Math.round(duration),
      },
      note: decision === "safe"
        ? "Atria tidak menemukan pelanggaran yang terlihat pada frame sampel. Pemeriksaan admin tetap disarankan."
        : decision === "blocked"
          ? "Atria menandai frame sampel sebagai pelanggaran yang jelas; publikasi diblokir."
          : "Atria tidak dapat memastikan keamanan dari sampel frame; perlu review manual.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : "unknown";
    return { decision: "unavailable", provider, result: { stage: "request", error: message }, note: "Scan Atria gagal atau timeout; video tetap ditahan untuk review admin." };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function scanCreatorVideo(input: {
  videoUrl: string;
  videoId: string;
  title: string;
  description: string | null;
  storagePath?: string;
}): Promise<ScanResult> {
  const atriaApiKey = process.env.ATRIA_API_KEY?.trim();
  if (atriaApiKey) {
    return scanWithAtria({ ...input, apiKey: atriaApiKey });
  }

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
