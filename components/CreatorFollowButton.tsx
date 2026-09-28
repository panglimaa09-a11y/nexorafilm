"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatorFollowButton({
  channelId,
  initialFollowing,
  initialFollowers,
  loggedIn,
  ownChannel = false,
}: {
  channelId: string;
  initialFollowing: boolean;
  initialFollowers: number;
  loggedIn: boolean;
  ownChannel?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState(initialFollowers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (!loggedIn) {
      router.push("/login?next=" + encodeURIComponent(window.location.pathname));
      return;
    }
    if (ownChannel || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creator/follow", {
        method: following ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Permintaan gagal.");
      setFollowing(Boolean(result.following));
      setFollowers(Number(result.followers ?? followers));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={busy || ownChannel}
          className={following
            ? "rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            : "rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"}
        >
          {busy ? "Memproses..." : ownChannel ? "Channel kamu" : following ? "✓ Mengikuti" : "＋ Follow kreator"}
        </button>
        <span className="text-sm text-zinc-400">{followers.toLocaleString("id-ID")} pengikut</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    </div>
  );
}
