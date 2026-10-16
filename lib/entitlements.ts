import {createClient} from "./supabase-server";
import {createAdminClient} from "./supabase-admin";

export const TOKEN_PRICE = 15000; // Rp per token (keputusan Tuan 9 Okt 2026)
export const TOKEN_PACKAGES = [1, 3, 5, 10]; // jumlah token per paket

export async function isAdmin(userId:string){
 const supabase=await createClient();
 const {data}=await supabase.from("profiles").select("role").eq("id",userId).maybeSingle();
 return data?.role==="admin";
}

// LEGACY: langganan dihapus (keputusan Tuan 16 Okt 2026: full token).
// Dipertahankan sementara untuk masa transisi; akan dihapus setelah konversi.
export async function hasActiveSubscription(userId:string, movieId?:string){
 if(await isAdmin(userId))return true;
 const supabase=await createClient();
 const {data}=await supabase.from("subscriptions").select("*, plans(*)").eq("user_id",userId).eq("status","active").gt("current_period_end",new Date().toISOString()).maybeSingle();
 if(!data)return false;
 if(!movieId)return true;
 const {data:allowed}=await supabase.from("movie_plans").select("movie_id").eq("movie_id",movieId).eq("plan_id",data.plan_id).maybeSingle();
 return !!allowed;
}

// Saldo token user (0 bila belum pernah punya).
export async function tokenBalance(userId:string):Promise<number>{
 const supabase=await createClient();
 const {data}=await supabase.from("token_balances").select("balance").eq("user_id",userId).maybeSingle();
 return data?.balance ?? 0;
}

// Cek baca-saja: admin ATAU punya unlock aktif (dalam 48 jam).
// Untuk status tombol di halaman film — TIDAK memotong token.
export async function hasTokenAccess(userId:string, movieId:string):Promise<boolean>{
 if(await isAdmin(userId))return true;
 const supabase=await createClient();
 const {data}=await supabase.from("token_unlocks").select("movie_id").eq("user_id",userId).eq("movie_id",movieId).gt("expires_at",new Date().toISOString()).maybeSingle();
 return !!data;
}

// Potong 1 token untuk 1 film (atomik via RPC, service_role).
// return: 'unlocked' | 'spent' | 'insufficient' | 'movie_not_found'
export async function spendTokenForMovie(userId:string, movieId:string):Promise<string>{
 const admin=createAdminClient();
 const {data, error}=await admin.rpc("spend_token_for_movie",{p_user_id:userId,p_movie_id:movieId});
 if(error){ console.error("spend_token_for_movie failed:", error.message); return "error"; }
 return (data as string) ?? "error";
}
