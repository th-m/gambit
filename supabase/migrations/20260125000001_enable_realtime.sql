-- Migration: Enable Supabase real-time replication for game tables
-- This migration adds the required tables to the supabase_realtime publication
-- so that clients can subscribe to changes in real-time.

-- =============================================================================
-- Enable Real-time Replication
-- =============================================================================

-- Add games table to real-time publication
-- This allows clients to subscribe to game state changes (status, phase, scores, etc.)
ALTER PUBLICATION supabase_realtime ADD TABLE games;

-- Add players table to real-time publication
-- This allows clients to see when players join/leave and character assignments
ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- Add game_actions table to real-time publication
-- This allows clients to see votes and actions in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE game_actions;

-- Add player_statuses table to real-time publication
-- This allows clients to see status changes (protected, beepered, etc.)
ALTER PUBLICATION supabase_realtime ADD TABLE player_statuses;

-- =============================================================================
-- Verification
-- =============================================================================
-- After running this migration, you can verify real-time is enabled by:
--
-- 1. Checking the publication tables:
--    SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--
-- 2. Expected output should include:
--    - games
--    - players
--    - game_actions
--    - player_statuses
--
-- 3. Testing in client code:
--    const channel = supabase.channel('game-changes')
--      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, handler)
--      .subscribe();
--
-- =============================================================================
-- Notes
-- =============================================================================
-- - game_modifiers table is NOT included as modifiers are read-only for clients
--   and are applied server-side. They don't need real-time updates.
-- - game_logs table is NOT included as logs are for debugging/analytics only
--   and don't need real-time updates to clients.
-- - Real-time subscriptions still respect RLS policies - clients will only
--   receive events for rows they have permission to SELECT.
