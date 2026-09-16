let organizationSchemaReady=null;

async function addColumnIfMissing(env,table,column,sql){
  const info=(await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results||[];
  if(info.some(item=>item.name===column))return;
  try{await env.DB.prepare(sql).run();}
  catch(error){if(!String(error?.message||error).toLowerCase().includes('duplicate column'))throw error;}
}

export async function ensureOrganizationSchema(env){
  if(!env.DB)return;
  if(organizationSchemaReady)return organizationSchemaReady;
  organizationSchemaReady=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('team','community')),
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(type,name_key)
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS organizations_owner ON organizations(owner_user_id)').run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS organization_members (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','manager','member')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(organization_id,user_id)
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS organization_members_user ON organization_members(user_id)').run();
    await addColumnIfMissing(env,'registrations','organization_id','ALTER TABLE registrations ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT');
    await addColumnIfMissing(env,'crews','organization_id','ALTER TABLE crews ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT');
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS registrations_organization ON registrations(organization_id,event_id,departure_id)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS crews_organization ON crews(organization_id,event_id,departure_id)').run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS organization_member_one_team BEFORE INSERT ON organization_members
      WHEN (SELECT type FROM organizations WHERE id=NEW.organization_id)='team'
      BEGIN
        SELECT RAISE(ABORT,'one_team_only') WHERE EXISTS (
          SELECT 1 FROM organization_members om JOIN organizations o ON o.id=om.organization_id
          WHERE om.user_id=NEW.user_id AND o.type='team' AND om.organization_id!=NEW.organization_id
        );
      END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS organization_member_one_team_update BEFORE UPDATE OF organization_id,user_id ON organization_members
      WHEN (SELECT type FROM organizations WHERE id=NEW.organization_id)='team'
      BEGIN
        SELECT RAISE(ABORT,'one_team_only') WHERE EXISTS (
          SELECT 1 FROM organization_members om JOIN organizations o ON o.id=om.organization_id
          WHERE om.user_id=NEW.user_id AND o.type='team' AND om.organization_id!=OLD.organization_id
        );
      END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS registration_one_organization BEFORE INSERT ON registrations
      BEGIN
        SELECT RAISE(ABORT,'participant_other_organization') WHERE EXISTS (
          SELECT 1 FROM registrations r
          WHERE r.participant_id=NEW.participant_id AND r.event_id=NEW.event_id AND r.departure_id=NEW.departure_id
            AND COALESCE(r.organization_id,'')!=COALESCE(NEW.organization_id,'')
        );
      END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS registration_organization_fixed BEFORE UPDATE OF organization_id ON registrations
      BEGIN
        SELECT RAISE(ABORT,'organization_fixed') WHERE COALESCE(NEW.organization_id,'')!=COALESCE(OLD.organization_id,'');
      END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS crew_organization_fixed BEFORE UPDATE OF organization_id ON crews
      BEGIN
        SELECT RAISE(ABORT,'organization_fixed') WHERE COALESCE(NEW.organization_id,'')!=COALESCE(OLD.organization_id,'');
      END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS crew_member_same_organization BEFORE INSERT ON crew_members
      BEGIN
        SELECT RAISE(ABORT,'organization_mismatch') WHERE EXISTS (
          SELECT 1 FROM crews c JOIN registrations r ON r.id=NEW.registration_id
          WHERE c.id=NEW.crew_id AND COALESCE(c.organization_id,'')!=COALESCE(r.organization_id,'')
        );
      END`).run();
    try{await env.DB.prepare("INSERT OR IGNORE INTO d1_migrations(name) VALUES('0018_organizations.sql')").run();}catch{}
  })().catch(error=>{organizationSchemaReady=null;throw error;});
  return organizationSchemaReady;
}
