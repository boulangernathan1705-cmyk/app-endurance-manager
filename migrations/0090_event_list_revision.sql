-- A small, durable invalidation token, maintained by the database for browser writes,
-- imports, scheduled tasks and administrative SQL alike. No event payload is cached publicly.
CREATE TABLE event_list_revision (
  id INTEGER PRIMARY KEY CHECK (id=1),
  generation TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO event_list_revision(id,generation) VALUES(1,lower(hex(randomblob(16))));

-- Range lookups for clock-only invalidation, independent of the number of archived events.
CREATE INDEX events_last_start_clock ON events(last_start);
CREATE INDEX events_stream_start_clock ON events(CAST(json_extract(departures,'$[0].startsAt') AS INTEGER)) WHERE sim='stream';

CREATE TRIGGER event_list_events_insert AFTER INSERT ON events BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_events_update AFTER UPDATE ON events BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_events_delete AFTER DELETE ON events BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_registrations_insert AFTER INSERT ON registrations BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_registrations_update AFTER UPDATE ON registrations BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_registrations_delete AFTER DELETE ON registrations BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_crews_insert AFTER INSERT ON crews BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_crews_update AFTER UPDATE ON crews BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_crews_delete AFTER DELETE ON crews BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_crew_members_insert AFTER INSERT ON crew_members BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_crew_members_update AFTER UPDATE ON crew_members BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_crew_members_delete AFTER DELETE ON crew_members BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_event_absences_insert AFTER INSERT ON event_absences BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_event_absences_update AFTER UPDATE ON event_absences BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_event_absences_delete AFTER DELETE ON event_absences BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_communities_insert AFTER INSERT ON communities BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_communities_update AFTER UPDATE ON communities BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_communities_delete AFTER DELETE ON communities BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_community_role_permissions_insert AFTER INSERT ON community_role_permissions BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_community_role_permissions_update AFTER UPDATE ON community_role_permissions WHEN NEW.community_id IS NOT OLD.community_id OR NEW.discord_role_id IS NOT OLD.discord_role_id OR NEW.permissions IS NOT OLD.permissions BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_community_role_permissions_delete AFTER DELETE ON community_role_permissions BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_users_insert AFTER INSERT ON users BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_users_update AFTER UPDATE ON users WHEN NEW.id IS NOT OLD.id OR NEW.name IS NOT OLD.name BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_users_delete AFTER DELETE ON users BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_participants_insert AFTER INSERT ON participants BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_participants_update AFTER UPDATE ON participants WHEN NEW.id IS NOT OLD.id OR NEW.name IS NOT OLD.name OR NEW.user_id IS NOT OLD.user_id OR NEW.community_id IS NOT OLD.community_id OR NEW.created_by IS NOT OLD.created_by OR NEW.guest_hash IS NOT OLD.guest_hash BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_participants_delete AFTER DELETE ON participants BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER event_list_memberships_insert AFTER INSERT ON memberships BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_memberships_update AFTER UPDATE ON memberships WHEN NEW.community_id IS NOT OLD.community_id OR NEW.user_id IS NOT OLD.user_id OR NEW.discord_roles IS NOT OLD.discord_roles OR NEW.nickname IS NOT OLD.nickname OR NEW.discord_admin IS NOT OLD.discord_admin OR NEW.status IS NOT OLD.status BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER event_list_memberships_delete AFTER DELETE ON memberships BEGIN
  UPDATE event_list_revision SET revision=revision+1 WHERE id=1;
END;

