import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';

export default async function Navbar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let role = 'user';
  if (user) { const { data } = await supabase.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle(); role = data?.role || 'user'; }
  return <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-black/75 backdrop-blur-xl">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-10">
      <Link href="/" className="text-xl font-black">NEXORA <span className="text-red-500">FILM</span></Link>
      <nav className="hidden items-center gap-5 text-sm text-zinc-300 md:flex">
        <Link href="/">Beranda</Link><Link href="/movies">Film</Link><Link href="/search">Cari</Link><Link href="/plans">Paket</Link>
        {user && <><Link href="/my-list">Daftar Saya</Link><Link href="/history">Riwayat</Link></>}
        {role === 'admin' && <Link href="/admin" className="text-red-400">Admin</Link>}
      </nav>
      <div className="flex items-center gap-2">
        {user ? <><Link href="/profile" className="nexora-btn-secondary !min-h-10 !px-4">Profil</Link><form action="/api/auth/signout" method="post"><button className="nexora-btn-primary !min-h-10 !px-4">Keluar</button></form></> : <Link href="/login" className="nexora-btn-primary !min-h-10 !px-4">Masuk</Link>}
      </div>
    </div>
  </header>;
}
