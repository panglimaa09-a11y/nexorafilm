'use client';
import { useState } from 'react';

type Msg = { role: 'user' | 'agent'; text: string };

type Pending = { token: string; action: string; summary?: { count?: number; access?: string; files?: string[] } } | null;

export default function AdminAgent() {
  const [messages, setMessages] = useState<Msg[]>([{ role: 'agent', text: 'Halo Bos. Saya Agent NEXORA FILM. Saya akan bertanya dulu sebelum melakukan perubahan apa pun pada katalog.' }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  async function send(text = input) {
    const value = text.trim(); if (!value || busy) return;
    setInput(''); setMessages((m) => [...m, { role: 'user', text: value }]); setBusy(true);
    try {
      const res = await fetch('/api/admin/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: value }) });
      const data = await res.json();
      setMessages((m) => [...m, { role: 'agent', text: data.reply || 'Tidak ada respons.' }]);
      if (data.needsConfirmation && data.confirmationToken) setPending({ token: data.confirmationToken, action: data.action, summary: data.summary });
      else setPending(null);
    } catch (e: any) { setMessages((m) => [...m, { role: 'agent', text: e?.message || 'Agent gagal dijalankan.' }]); }
    finally { setBusy(false); }
  }

  async function confirmChange() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true, confirmationToken: pending.token }) });
      const data = await res.json();
      setMessages((m) => [...m, { role: 'agent', text: data.reply || 'Konfirmasi diproses.' }]);
      setPending(null);
    } catch (e: any) { setMessages((m) => [...m, { role: 'agent', text: e?.message || 'Konfirmasi gagal.' }]); }
    finally { setBusy(false); }
  }

  function cancelChange() {
    if (busy) return;
    setPending(null);
    setMessages((m) => [...m, { role: 'agent', text: 'Dibatalkan. Tidak ada perubahan yang dilakukan.' }]);
  }

  const examples = ['Tampilkan daftar film', 'Jadikan "Film Saya" premium', 'Publish "Film Saya"', 'Import semua film dari media/movies dengan akses regular'];
  return <div className="glass mt-8 rounded-3xl border border-white/10 p-4 sm:p-6">
    <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-red-400">AI AGENT</p><h2 className="mt-1 text-2xl font-black">NEXORA Operator</h2></div><span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">ADMIN ONLY</span></div>
    <div className="min-h-[360px] space-y-3 overflow-y-auto rounded-2xl bg-black/40 p-4">{messages.map((m, i) => <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-white text-black' : 'bg-white/10 text-zinc-100'}`}>{m.text}</div></div>)}{busy && <div className="text-sm text-zinc-500">Agent sedang memeriksa…</div>}</div>
    {pending && <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4"><p className="text-sm font-bold text-amber-200">Konfirmasi diperlukan</p><p className="mt-1 text-xs text-zinc-300">Agent belum menjalankan perubahan. Periksa pertanyaan di atas sebelum memilih.</p>{pending.summary?.files?.length ? <p className="mt-2 text-xs text-zinc-400">File: {pending.summary.files.slice(0, 8).join(', ')}{(pending.summary.files.length || 0) > 8 ? '…' : ''}</p> : null}<div className="mt-3 flex gap-2"><button onClick={confirmChange} disabled={busy} className="nexora-btn-primary">Ya, jalankan</button><button onClick={cancelChange} disabled={busy} className="nexora-btn-secondary">Batalkan</button></div></div>}
    <div className="mt-4 flex flex-wrap gap-2">{examples.map((x) => <button key={x} onClick={() => send(x)} disabled={busy || !!pending} className="rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10">{x}</button>)}</div>
    <div className="mt-4 flex gap-2"><input className="input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Contoh: ubah Film X menjadi Premium" disabled={busy || !!pending}/><button onClick={() => send()} disabled={busy || !!pending || !input.trim()} className="nexora-btn-primary">Kirim</button></div>
    <p className="mt-3 text-xs text-zinc-500">Mode aman: Agent hanya merencanakan perubahan. Mutasi katalog membutuhkan konfirmasi eksplisit dan token konfirmasi server yang kedaluwarsa.</p>
  </div>
}
