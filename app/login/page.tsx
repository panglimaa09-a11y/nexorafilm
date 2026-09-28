'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setMessage(''); setLoading(true);
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) { setMessage('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.'); return; }
        if (!data.user) return;
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle(); router.replace(profile?.role === 'admin' ? '/admin' : '/'); router.refresh();
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error('Session login tidak terbentuk. Coba lagi.');
        if (!data.user) return;
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle(); router.replace(profile?.role === 'admin' ? '/admin' : '/'); router.refresh();
      }
    } catch (err: any) { setError(err?.message || 'Login gagal.'); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen grid place-items-center px-6 py-12">
    <form onSubmit={submit} className="glass w-full max-w-md rounded-2xl border border-white/10 p-7">
      <a href="/" className="text-2xl font-black">NEXORA <span className="text-red-500">FILM</span></a>
      <p className="mt-2 text-zinc-400">{signup ? 'Buat akun baru' : 'Masuk ke akun NEXORA FILM'}</p>
      <input className="input mt-7" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
      <input className="input mt-3" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-400">{message}</p>}
      <button disabled={loading} className="nexora-btn-primary mt-5 w-full">{loading ? 'Memproses...' : signup ? 'Daftar' : 'Masuk'}</button>
      <button type="button" onClick={()=>{setSignup(!signup);setError('');setMessage('')}} className="mt-4 w-full text-sm text-zinc-400 hover:text-white">{signup ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>
    </form>
  </main>;
}
