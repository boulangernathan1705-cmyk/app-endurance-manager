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

    // 0018 reste présent pour compatibilité avec les données déjà créées sur DEV.
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
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS crew_organization_fixed BEFORE UPDATE OF organization_id ON crews
      BEGIN
        SELECT RAISE(ABORT,'organization_fixed') WHERE COALESCE(NEW.organization_id,'')!=COALESCE(OLD.organization_id,'');
      END`).run();

    // 0019 : une inscription unique peut être visible dans plusieurs groupes.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS registration_audiences (
      registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
      audience_key TEXT NOT NULL,
      organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(registration_id,audience_key),
      CHECK((audience_key='general' AND organization_id IS NULL) OR (audience_key!='general' AND organization_id=audience_key))
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS registration_audiences_organization ON registration_audiences(organization_id,registration_id)').run();

    await env.DB.prepare('DROP TRIGGER IF EXISTS registration_one_organization').run();
    await env.DB.prepare('DROP TRIGGER IF EXISTS registration_organization_fixed').run();
    await env.DB.prepare('DROP TRIGGER IF EXISTS crew_member_same_organization').run();

    // Chaque ancienne inscription garde son ancien espace comme première audience.
    await env.DB.prepare(`INSERT OR IGNORE INTO registration_audiences(registration_id,audience_key,organization_id,created_at)
      SELECT r.id,COALESCE(r.organization_id,'general'),r.organization_id,r.created_at
      FROM registrations r
      WHERE NOT EXISTS(SELECT 1 FROM registration_audiences a WHERE a.registration_id=r.id)`).run();
    await env.DB.prepare('UPDATE registrations SET organization_id=NULL WHERE organization_id IS NOT NULL').run();

    // Recrée les deux garde-fous pour être certain que le runtime et les migrations restent alignés.
    await env.DB.prepare('DROP TRIGGER IF EXISTS crew_member_audience').run();
    await env.DB.prepare(`CREATE TRIGGER crew_member_audience BEFORE INSERT ON crew_members
      BEGIN
        SELECT RAISE(ABORT,'crew_membership_audience') WHERE NOT EXISTS (
          SELECT 1 FROM crews c JOIN registration_audiences a ON a.registration_id=NEW.registration_id
          WHERE c.id=NEW.crew_id AND (
            (c.organization_id IS NULL AND a.audience_key='general')
            OR (c.organization_id IS NOT NULL AND a.organization_id=c.organization_id)
          )
        );
      END`).run();
    await env.DB.prepare('DROP TRIGGER IF EXISTS registration_audience_in_use').run();
    await env.DB.prepare(`CREATE TRIGGER registration_audience_in_use BEFORE DELETE ON registration_audiences
      BEGIN
        SELECT RAISE(ABORT,'audience_in_use') WHERE EXISTS (
          SELECT 1 FROM crew_members cm JOIN crews c ON c.id=cm.crew_id
          WHERE cm.registration_id=OLD.registration_id AND (
            (c.organization_id IS NULL AND OLD.audience_key='general')
            OR (c.organization_id IS NOT NULL AND OLD.organization_id=c.organization_id)
          )
        );
      END`).run();

    // 0020 : annuaire de communautés et liaison Discord optionnelle.
    await addColumnIfMissing(env,'organizations','description',"ALTER TABLE organizations ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing(env,'organizations','language',"ALTER TABLE organizations ADD COLUMN language TEXT NOT NULL DEFAULT 'fr'");
    await addColumnIfMissing(env,'organizations','games',"ALTER TABLE organizations ADD COLUMN games TEXT NOT NULL DEFAULT '[\"lmu\",\"iracing\"]'");
    await addColumnIfMissing(env,'organizations','visibility',"ALTER TABLE organizations ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'");
    await addColumnIfMissing(env,'organizations','join_mode',"ALTER TABLE organizations ADD COLUMN join_mode TEXT NOT NULL DEFAULT 'open'");
    await addColumnIfMissing(env,'organizations','discord_guild_id','ALTER TABLE organizations ADD COLUMN discord_guild_id TEXT');
    await addColumnIfMissing(env,'organizations','discord_guild_name','ALTER TABLE organizations ADD COLUMN discord_guild_name TEXT');
    await addColumnIfMissing(env,'organizations','discord_role_id','ALTER TABLE organizations ADD COLUMN discord_role_id TEXT');
    await addColumnIfMissing(env,'organizations','discord_role_name','ALTER TABLE organizations ADD COLUMN discord_role_name TEXT');
    await addColumnIfMissing(env,'organizations','updated_at','ALTER TABLE organizations ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS organization_join_requests (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(organization_id,user_id)
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS organization_join_requests_user ON organization_join_requests(user_id,created_at)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS organizations_directory ON organizations(type,visibility,name_key)').run();

    try{await env.DB.prepare("INSERT OR IGNORE INTO d1_migrations(name) VALUES('0018_organizations.sql')").run();}catch{}
    try{await env.DB.prepare("INSERT OR IGNORE INTO d1_migrations(name) VALUES('0019_registration_audiences.sql')").run();}catch{}
    try{await env.DB.prepare("INSERT OR IGNORE INTO d1_migrations(name) VALUES('0020_community_directory.sql')").run();}catch{}
  })().catch(error=>{organizationSchemaReady=null;throw error;});
  return organizationSchemaReady;
}
