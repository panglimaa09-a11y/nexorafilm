import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase-server";
import { TOKEN_PRICE, TOKEN_PACKAGES } from "@/lib/entitlements";
import Link from "next/link";

export default async function Tokens({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  let balance = 0;
  if (user) {
    const { data } = await db.from("token_balances").select("balance").eq("user_id", user.id).maybeSingle();
    balance = data?.balance ?? 0;
  }
  const rp = (n: number) => "Rp " + n.toLocaleString("id-ID");
  return (
    <>
      <Navbar />
      <main className="min-h-screen px-6 pt-32 pb-16 md:px-14">
        <h1 className="text-4xl md:text-6xl font-black">Beli Token</h1>
        <p className="mt-3 text-zinc-400">
          1 token = 1 film, bisa ditonton ulang selama 48 jam. Tanpa langganan, bayar seperlunya.
        </p>
        {user && (
          <p className="mt-4 inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-300 font-bold">
            🎟 Saldo kamu: {balance} token
          </p>
        )}
        {error && (
          <p className="mt-4 text-red-400">Terjadi kesalahan ({error}). Coba lagi.</p>
        )}
        <div className="mt-10 grid gap-5 md:grid-cols-4">
          {TOKEN_PACKAGES.map((qty) => (
            <article key={qty} className="glass rounded-2xl border border-white/10 p-6">
              <h2 className="text-2xl font-bold">{qty} Token</h2>
              <div className="my-5 text-3xl font-black">
                {rp(qty * TOKEN_PRICE)}
              </div>
              <ul className="space-y-3 text-sm text-zinc-300">
                <li>✓ {qty} film pilihanmu</li>
                <li>✓ 48 jam akses per film</li>
                <li>✓ Tidak hangus</li>
              </ul>
              {user ? (
                <form action="/api/checkout" method="post">
                  <input type="hidden" name="token_qty" value={qty} />
                  <button className="mt-7 block w-full rounded-lg bg-red-600 py-3 text-center font-bold">
                    Beli {qty} Token
                  </button>
                </form>
              ) : (
                <Link href="/login" className="mt-7 block rounded-lg bg-red-600 py-3 text-center font-bold">
                  Login untuk Beli
                </Link>
              )}
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
