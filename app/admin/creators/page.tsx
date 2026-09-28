import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AdminCreatorModerationClient from "@/components/AdminCreatorModerationClient";

export const dynamic = "force-dynamic";

export default async function AdminCreatorsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/");

  const [
    { data: channels, error: channelsError },
    { data: videos, error: videosError },
  ] = await Promise.all([
    db.from("creator_channels")
      .select("id,user_id,name,handle,description,status,created_at")
      .order("created_at", { ascending: false }),
    db.from("creator_videos")
      .select("id,channel_id,owner_id,title,description,storage_path,status,moderation_note,created_at")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <main className="min-h-screen bg-[#080b12] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm text-cyan-300 hover:text-cyan-200">
          ← Kembali ke Dashboard Admin
        </Link>

        <header className="mb-8 mt-5">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">Creator Studio / Moderation</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Moderasi Kreator</h1>
          <p className="mt-2 text-sm text-slate-400">
            Periksa channel dan video sebelum konten dipublikasikan.
          </p>
        </header>

        {(channelsError || videosError) && (
          <div role="alert" className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            Data moderasi tidak dapat dimuat. Periksa migrasi, RLS, dan kebijakan admin Supabase.
            {channelsError && <p>Channel: {channelsError.message}</p>}
            {videosError && <p>Video: {videosError.message}</p>}
          </div>
        )}

        <AdminCreatorModerationClient channels={channels ?? []} videos={videos ?? []} />
      </div>
    </main>
  );
}
