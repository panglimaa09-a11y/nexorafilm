import {createClient} from "./supabase-server";
export async function hasActiveSubscription(userId:string, movieId?:string){
 const supabase=await createClient();
 const {data}=await supabase.from("subscriptions").select("*, plans(*)").eq("user_id",userId).eq("status","active").gt("current_period_end",new Date().toISOString()).maybeSingle();
 if(!data)return false;
 if(!movieId)return true;
 const {data:allowed}=await supabase.from("movie_plans").select("movie_id").eq("movie_id",movieId).eq("plan_id",data.plan_id).maybeSingle();
 return !!allowed;
}