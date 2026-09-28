import { redirect } from 'next/navigation'; import { createClient } from '@/lib/supabase-server';
export async function requireAdmin(){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();if(profile?.role!=='admin')redirect('/');return {db,user};}
