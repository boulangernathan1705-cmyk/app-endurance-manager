export const SITE_COMMUNITY_FALLBACK_ID='c0000000-0000-4000-8000-000000000001';
export const SITE_COMMUNITY_NAME='Les Tondeuz à gazon';
export const SITE_COMMUNITY_NAME_KEY='les tondeuz à gazon';

export async function siteCommunity(env){
  if(!env?.DB)return null;
  return env.DB.prepare("SELECT * FROM organizations WHERE type='community' AND (id=? OR name_key=?) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1")
    .bind(SITE_COMMUNITY_FALLBACK_ID,SITE_COMMUNITY_NAME_KEY,SITE_COMMUNITY_FALLBACK_ID).first();
}
