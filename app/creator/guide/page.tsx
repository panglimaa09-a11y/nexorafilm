import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function CreatorGuidePage() {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <Navbar />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-28 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[.25em] text-red-400">NEXORA FILM / CREATOR HANDBOOK</p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">Panduan Kreator</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-zinc-400">Panduan penggunaan Creator Studio, proses review, standar keamanan konten, hak cipta, dan target kelayakan monetisasi.</p>

        <nav aria-label="Panduan kreator" className="mt-8 flex flex-wrap gap-3">
          <a href="#mulai" className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Mulai</a>
          <a href="#upload" className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Upload Shorts</a>
          <a href="#keamanan" className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Safety scan</a>
          <a href="#aturan" className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Peraturan</a>
          <a href="#monetisasi" className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Monetisasi</a>
        </nav>

        <section id="mulai" className="mt-10 rounded-3xl border border-white/10 bg-white/[.035] p-6 sm:p-8">
          <h2 className="text-2xl font-bold">1. Memulai channel</h2>
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-7 text-zinc-300">
            <li>Masuk ke akun NexoraFilm dan buka Creator Studio.</li>
            <li>Buat nama channel, handle unik, dan deskripsi yang sesuai.</li>
            <li>Tunggu admin meninjau channel. Upload hanya tersedia saat channel berstatus aktif.</li>
            <li>Gunakan Analytics Kreator untuk memantau pengikut, views tercatat, status Shorts, dan target kelayakan.</li>
          </ol>
        </section>

        <section id="upload" className="mt-5 rounded-3xl border border-white/10 bg-white/[.035] p-6 sm:p-8">
          <h2 className="text-2xl font-bold">2. Aturan upload Shorts</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-black/30 p-5"><p className="text-sm text-zinc-500">Format</p><p className="mt-2 font-semibold">MP4, WebM, MOV</p></div>
            <div className="rounded-2xl bg-black/30 p-5"><p className="text-sm text-zinc-500">Batas unggah aplikasi</p><p className="mt-2 font-semibold">Maksimum 1 GB</p></div>
            <div className="rounded-2xl bg-black/30 p-5"><p className="text-sm text-zinc-500">Metadata</p><p className="mt-2 font-semibold">Judul dan deskripsi akurat</p></div>
            <div className="rounded-2xl bg-black/30 p-5"><p className="text-sm text-zinc-500">Publikasi</p><p className="mt-2 font-semibold">Scan dan review admin wajib</p></div>
          </div>
          <p className="mt-5 text-sm leading-7 text-zinc-300">Creator Studio komunitas hanya untuk Shorts. Film panjang dan serial harus diajukan serta diterbitkan melalui alur Manajemen Film oleh admin. Jangan mengunggah file yang bukan milikmu atau yang tidak kamu punya hak distribusinya.</p>
        </section>

        <section id="keamanan" className="mt-5 rounded-3xl border border-amber-400/20 bg-amber-400/[.04] p-6 sm:p-8">
          <h2 className="text-2xl font-bold">3. Pemindaian keamanan otomatis</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300">Setelah upload, sistem mengirim URL video sementara dan metadata ke layanan pemindaian yang dikonfigurasi pengelola. Hasilnya ditandai aman, diblokir, perlu review, atau tidak tersedia. Hasil aman bukan jaminan mutlak; admin tetap memeriksa konten sebelum publikasi.</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-zinc-300">
            <li>Jika scanner tidak dikonfigurasi, timeout, atau memberi hasil tidak jelas, video tetap ditahan.</li>
            <li>Konten yang ditandai berbahaya tidak boleh dipublikasikan.</li>
            <li>Jangan mencoba mengakali scanner dengan memotong, menyamarkan, atau mengganti nama file.</li>
            <li>Video dapat diperiksa ulang setelah laporan pengguna atau peninjauan admin.</li>
          </ul>
          <p className="mt-5 rounded-xl border border-amber-400/20 p-4 text-sm leading-6 text-amber-100">Catatan untuk pengelola: pemeriksaan konten video sungguhan membutuhkan penyedia scanning yang mendukung analisis video dan harus dikonfigurasi melalui VIDEO_MODERATION_API_URL serta VIDEO_MODERATION_API_KEY di server. Tanpa keduanya, sistem sengaja gagal-tertutup dan tidak menganggap video aman.</p>
        </section>

        <section id="aturan" className="mt-5 rounded-3xl border border-white/10 bg-white/[.035] p-6 sm:p-8">
          <h2 className="text-2xl font-bold">4. Peraturan komunitas</h2>
          <div className="mt-5 space-y-4 text-sm leading-7 text-zinc-300">
            <div><h3 className="font-bold text-white">Konten yang dilarang</h3><p>Dilarang mengunggah eksploitasi atau pelecehan seksual, konten seksual yang melibatkan anak, kekerasan grafis, ajakan menyakiti diri, ancaman, ujaran kebencian, eksploitasi, instruksi tindakan berbahaya, promosi aktivitas ilegal, doxxing, penipuan, malware, atau konten yang mendorong bahaya nyata.</p></div>
            <div><h3 className="font-bold text-white">Hak cipta dan izin</h3><p>Unggah hanya konten yang kamu buat atau yang penggunaannya telah diizinkan. Jangan membajak film, acara TV, musik, atau karya pihak lain. Klaim hak cipta dapat menyebabkan konten diturunkan atau channel ditangguhkan.</p></div>
            <div><h3 className="font-bold text-white">Privasi dan persetujuan</h3><p>Jangan mengunggah alamat, nomor telepon, dokumen, percakapan pribadi, atau rekaman orang lain tanpa dasar izin yang sah. Hormati privasi dan persetujuan orang yang terekam.</p></div>
            <div><h3 className="font-bold text-white">Spam dan manipulasi</h3><p>Dilarang membeli pengikut atau views, memakai bot, melakukan follow/unfollow massal, mengulang upload untuk mengakali review, atau memalsukan engagement demi monetisasi.</p></div>
            <div><h3 className="font-bold text-white">Penegakan</h3><p>Konten dapat ditahan, ditolak, dihapus, atau channel dibatasi. Pelanggaran serius atau berulang dapat berujung pada penangguhan. Keputusan moderasi dapat ditinjau ulang melalui jalur dukungan resmi jika tersedia.</p></div>
          </div>
        </section>

        <section id="monetisasi" className="mt-5 rounded-3xl border border-emerald-400/20 bg-emerald-400/[.035] p-6 sm:p-8">
          <h2 className="text-2xl font-bold">5. Kelayakan monetisasi</h2>
          <p className="mt-4 text-sm leading-7 text-zinc-300">Target awal yang ditampilkan di dashboard adalah channel aktif, sedikitnya 1.000 pengikut, dan 10.000 permintaan pemutaran tercatat. Angka tersebut merupakan target awal platform, bukan janji penghasilan atau persetujuan otomatis.</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-zinc-300">
            <li>Konten harus mematuhi aturan, punya hak distribusi, dan lolos pemeriksaan.</li>
            <li>Views atau followers yang tidak valid dapat dikecualikan.</li>
            <li>Pengelola harus menyetujui program, menyiapkan syarat pembayaran, pemeriksaan identitas yang relevan, dan sistem pencairan sebelum pembayaran bisa dilakukan.</li>
            <li>Jangan menjanjikan penghasilan berdasarkan views saja; nilai pembayaran bergantung pada program resmi yang nantinya berlaku.</li>
          </ul>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 p-6 sm:p-8">
          <h2 className="text-xl font-bold">Butuh akses cepat?</h2>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/creator" className="rounded-full bg-red-600 px-5 py-3 text-sm font-bold hover:bg-red-500">Creator Studio</Link><Link href="/creator/analytics" className="rounded-full border border-white/15 px-5 py-3 text-sm hover:bg-white/5">Analytics Kreator</Link><Link href="/creators" className="rounded-full border border-white/15 px-5 py-3 text-sm hover:bg-white/5">Jelajahi Kreator</Link></div>
        </section>
        <p className="mt-8 text-xs leading-6 text-zinc-600">Panduan ini adalah aturan operasional awal NexoraFilm. Pengelola perlu meninjau aturan, privasi, proses banding, dan ketentuan pembayaran sebelum membuka program monetisasi publik.</p>
      </div>
    </main>
  );
}
