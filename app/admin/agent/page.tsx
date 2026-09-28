import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import AdminAgent from '@/components/AdminAgent';

export default async function AgentPage() {
  await requireAdmin();
  return <main><div className="mx-auto max-w-5xl px-6 pb-16 pt-10"><div className="flex items-center justify-between gap-4"><div><Link href="/admin">← Admin</Link><h1 className="mt-5 text-4xl font-black">NEXORA Agent</h1><p className="mt-2 text-zinc-400">Operator AI untuk pekerjaan admin yang berulang.</p></div><Link href="/admin/movies" className="nexora-btn-secondary">Kelola Film</Link></div><AdminAgent /></div></main>;
}
