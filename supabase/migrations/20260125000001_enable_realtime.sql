-- Migration: Enable Supabase real-time replication for game tables
-- This migration adds the required tables to the supabase_realtime publication
-- so that clients can subscribe to changes in real-time.

-- =============================================================================
-- Enable Real-time Replication
-- =============================================================================

-- Add gambit_games table to real-time publication
-- This allows clients to subscribe to game state changes (status, phase, scores, etc.)
ALTER PUBLICATION supabase_realtime ADD TABLE gambit_games;

-- Add gambit_players table to real-time publication
-- This allows clients to see when players join/leave and character assignments
ALTER PUBLICATION supabase_realtime ADD TABLE gambit_players;

-- Add gambit_game_actions table to real-time publication
-- This allows clients to see votes and actions in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE gambit_game_actions;

-- Add gambit_player_statuses table to real-time publication
-- This allows clients to see status changes (protected, beepered, etc.)
ALTER PUBLICATION supabase_realtime ADD TABLE gambit_player_statuses;

-- =============================================================================
-- Verification
-- =============================================================================
-- After running this migration, you can verify real-time is enabled by:
--
-- 1. Checking the publication tables:
--    SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--
-- 2. Expected output should include:
--    - gambit_games
--    - gambit_players
--    - gambit_game_actions
--    - gambit_player_statuses
--
-- 3. Testing in client code:
--    const channel = supabase.channel('game-changes')
--      .on('postgres_changes', { event: '*', schema: 'public', table: 'gambit_games' }, handler)
--      .subscribe();
--
-- =============================================================================
-- Notes
-- =============================================================================
-- - gambit_game_modifiers table is NOT included as modifiers are read-only for clients
--   and are applied server-side. They don't need real-time updates.
-- - gambit_game_logs table is NOT included as logs are for debugging/analytics only
--   and don't need real-time updates to clients.
-- - Real-time subscriptions still respect RLS policies - clients will only
--   receive events for rows they have permission to SELECT.
