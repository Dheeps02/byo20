-- Unique constraint on faction pair — prevents duplicate (A,B) entries.
-- faction_a_id < faction_b_id ordering is enforced at the app layer.
ALTER TABLE world.faction_relationships
  ADD CONSTRAINT faction_relationships_pair_unique UNIQUE (faction_a_id, faction_b_id);

-- Campaign-scoped lookup indexes across world.*, items.*, and log.*.
-- Postgres does not auto-index FK columns; every table filtered by
-- campaign_id in normal gameplay gets an explicit index here.
--
-- world.world_zones is omitted — it already has UNIQUE(campaign_id, hex_q, hex_r)
-- which doubles as an index with campaign_id as the leftmost key.

-- world.*
CREATE INDEX idx_world_npcs_campaign_id ON world.npcs (campaign_id);
CREATE INDEX idx_world_factions_campaign_id ON world.factions (campaign_id);
CREATE INDEX idx_world_quests_campaign_id ON world.quests (campaign_id);
CREATE INDEX idx_world_world_objects_campaign_id ON world.world_objects (campaign_id);
CREATE INDEX idx_world_campaign_agenda_campaign_id ON world.campaign_agenda (campaign_id);
CREATE INDEX idx_world_campaign_milestones_campaign_id ON world.campaign_milestones (campaign_id);
CREATE INDEX idx_world_narration_pool_campaign_id ON world.narration_pool (campaign_id);
CREATE INDEX idx_world_campaign_snapshots_campaign_id ON world.campaign_snapshots (campaign_id);
-- character_faction_reputation: looked up by (character_campaign_state_id, faction_id)
CREATE INDEX idx_world_cfr_ccstate_id ON world.character_faction_reputation (character_campaign_state_id);
CREATE INDEX idx_world_cfr_faction_id ON world.character_faction_reputation (faction_id);

-- items.*
CREATE INDEX idx_items_items_campaign_id ON items.items (campaign_id);
CREATE INDEX idx_items_containers_campaign_id ON items.containers (campaign_id);

-- log.*
CREATE INDEX idx_log_sessions_campaign_id ON log.sessions (campaign_id);
CREATE INDEX idx_log_event_log_campaign_id ON log.event_log (campaign_id);
CREATE INDEX idx_log_npc_dialogue_log_campaign_id ON log.npc_dialogue_log (campaign_id);
CREATE INDEX idx_log_party_chat_log_campaign_id ON log.party_chat_log (campaign_id);
-- combat_log has no campaign_id — accessed by encounter
CREATE INDEX idx_log_combat_log_encounter_id ON log.combat_log (encounter_id);
