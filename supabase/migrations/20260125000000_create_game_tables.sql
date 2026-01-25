-- Migration: Create game tables for Gambit social deduction game
-- This migration creates all tables required for the game as specified in technical-plan.md

-- =============================================================================
-- Enable required extensions
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Create Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- games: Primary table storing game state
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_key VARCHAR(8) UNIQUE NOT NULL,
    host_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'lobby' NOT NULL CHECK (status IN ('lobby', 'playing', 'finished')),
    phase VARCHAR(30) CHECK (phase IN ('lobby', 'voting_for_leader', 'selecting_team', 'mission_voting', 'resolution', 'assassination')),
    current_round INT DEFAULT 0 NOT NULL,
    crown_index INT DEFAULT 0 NOT NULL,
    rejection_count INT DEFAULT 0 NOT NULL,
    good_victories INT DEFAULT 0 NOT NULL,
    evil_victories INT DEFAULT 0 NOT NULL,
    selected_team UUID[] DEFAULT NULL,
    winner VARCHAR(10) CHECK (winner IN ('good', 'evil')),
    end_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Add comment for table documentation
COMMENT ON TABLE games IS 'Primary table storing game state for Gambit social deduction game';
COMMENT ON COLUMN games.game_key IS 'Shareable 6-8 character alphanumeric join code';
COMMENT ON COLUMN games.host_id IS 'User ID of game creator';
COMMENT ON COLUMN games.status IS 'Overall game status: lobby, playing, or finished';
COMMENT ON COLUMN games.phase IS 'Current game phase within a playing game';
COMMENT ON COLUMN games.current_round IS 'Active round number (1-5)';
COMMENT ON COLUMN games.crown_index IS 'Index of current leader in player order';
COMMENT ON COLUMN games.rejection_count IS 'Consecutive leader rejections (resets after 3)';
COMMENT ON COLUMN games.good_victories IS 'Missions won by good team';
COMMENT ON COLUMN games.evil_victories IS 'Missions won by evil team';
COMMENT ON COLUMN games.selected_team IS 'Player IDs selected for current mission';
COMMENT ON COLUMN games.winner IS 'Winning team when game is finished';
COMMENT ON COLUMN games.end_reason IS 'Reason the game ended';

-- -----------------------------------------------------------------------------
-- players: Players participating in games
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    character VARCHAR(50) CHECK (character IN ('Seer', 'Oracle', 'Guardian', 'Tracker', 'Villager', 'Soldier', 'Assassin', 'Fixer', 'Phantom', 'Saboteur', 'Minion')),
    team VARCHAR(10) CHECK (team IN ('good', 'evil')),
    is_alive BOOLEAN DEFAULT TRUE NOT NULL,
    seat_order INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE players IS 'Players participating in games';
COMMENT ON COLUMN players.game_id IS 'Associated game (foreign key)';
COMMENT ON COLUMN players.user_id IS 'User ID of the player';
COMMENT ON COLUMN players.display_name IS 'Shown to other players';
COMMENT ON COLUMN players.character IS 'Assigned character name (null until game starts)';
COMMENT ON COLUMN players.team IS 'Team alignment: good or evil (null until game starts)';
COMMENT ON COLUMN players.is_alive IS 'Whether player is still in the game';
COMMENT ON COLUMN players.seat_order IS 'Position in turn order (0 to N-1)';

-- -----------------------------------------------------------------------------
-- game_actions: Audit log of all player actions and votes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('vote_yes', 'vote_no', 'vote_pass', 'vote_fail', 'assassinate', 'rig_vote', 'plant_beeper', 'protect', 'sabotage', 'select_team', 'start_game')),
    target_ids UUID[],
    round INT,
    phase VARCHAR(30) CHECK (phase IN ('lobby', 'voting_for_leader', 'selecting_team', 'mission_voting', 'resolution', 'assassination')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE game_actions IS 'Audit log of all player actions and votes';
COMMENT ON COLUMN game_actions.action_type IS 'Type of action: votes, special abilities, etc.';
COMMENT ON COLUMN game_actions.target_ids IS 'Target player IDs if applicable';
COMMENT ON COLUMN game_actions.round IS 'Round when action occurred';
COMMENT ON COLUMN game_actions.phase IS 'Phase when action occurred';

-- -----------------------------------------------------------------------------
-- game_modifiers: Temporary effects on game state
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round INT NOT NULL,
    modifier_type VARCHAR(50) NOT NULL CHECK (modifier_type IN ('force_pass', 'extra_fail')),
    created_by UUID REFERENCES players(id),
    metadata JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE game_modifiers IS 'Temporary effects on game state (e.g., rigged votes)';
COMMENT ON COLUMN game_modifiers.round IS 'Round this modifier applies to';
COMMENT ON COLUMN game_modifiers.modifier_type IS 'Type: force_pass, extra_fail, etc.';
COMMENT ON COLUMN game_modifiers.created_by IS 'Player who created the modifier';
COMMENT ON COLUMN game_modifiers.metadata IS 'Additional data for the modifier';

-- -----------------------------------------------------------------------------
-- player_statuses: Temporary statuses on players
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    status_type VARCHAR(50) NOT NULL CHECK (status_type IN ('protected', 'beepered')),
    created_by UUID REFERENCES players(id),
    metadata JSONB DEFAULT '{}' NOT NULL,
    expires_at_round INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE player_statuses IS 'Temporary statuses on players (e.g., protected, beepered)';
COMMENT ON COLUMN player_statuses.status_type IS 'Type: protected, beepered, etc.';
COMMENT ON COLUMN player_statuses.created_by IS 'Player who applied the status';
COMMENT ON COLUMN player_statuses.expires_at_round IS 'Round when status expires (null = permanent until removed)';

-- -----------------------------------------------------------------------------
-- game_logs: Debug/analytics logging
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    phase VARCHAR(30) CHECK (phase IN ('lobby', 'voting_for_leader', 'selecting_team', 'mission_voting', 'resolution', 'assassination')),
    round INT,
    duration_ms INT,
    metadata JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE game_logs IS 'Debug/analytics logging for game events';
COMMENT ON COLUMN game_logs.action IS 'Event name';
COMMENT ON COLUMN game_logs.duration_ms IS 'Processing time in milliseconds';

-- =============================================================================
-- Create Indexes
-- =============================================================================

-- games.game_key (unique) - already created by UNIQUE constraint
-- CREATE INDEX IF NOT EXISTS idx_games_game_key ON games(game_key);

-- players.game_id, user_id (composite)
CREATE INDEX IF NOT EXISTS idx_players_game_user ON players(game_id, user_id);

-- game_actions.game_id, round, phase (composite)
CREATE INDEX IF NOT EXISTS idx_game_actions_game_round_phase ON game_actions(game_id, round, phase);

-- player_statuses.game_id, player_id, status_type (composite)
CREATE INDEX IF NOT EXISTS idx_player_statuses_game_player_status ON player_statuses(game_id, player_id, status_type);

-- Additional useful indexes for performance
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_game_id ON game_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_modifiers_game_round ON game_modifiers(game_id, round);

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Games table policies
-- -----------------------------------------------------------------------------

-- Anyone can view games (needed for joining by game_key)
CREATE POLICY "Games are viewable by everyone" ON games
    FOR SELECT USING (true);

-- Only the host can update their game
CREATE POLICY "Hosts can update their games" ON games
    FOR UPDATE USING (auth.uid()::text = host_id);

-- Authenticated users can create games
CREATE POLICY "Authenticated users can create games" ON games
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only the host can delete their game
CREATE POLICY "Hosts can delete their games" ON games
    FOR DELETE USING (auth.uid()::text = host_id);

-- -----------------------------------------------------------------------------
-- Players table policies
-- -----------------------------------------------------------------------------

-- Players in a game can view all players in that game
CREATE POLICY "Players can view other players in same game" ON players
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.game_id = players.game_id 
            AND p.user_id = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1 FROM games g 
            WHERE g.id = players.game_id 
            AND g.host_id = auth.uid()::text
        )
    );

-- Authenticated users can join games (insert themselves as players)
CREATE POLICY "Authenticated users can join games" ON players
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Players can update their own player record
CREATE POLICY "Players can update themselves" ON players
    FOR UPDATE USING (auth.uid()::text = user_id);

-- Game host can update any player in their game (for character assignment)
CREATE POLICY "Host can update players in their game" ON players
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM games g 
            WHERE g.id = players.game_id 
            AND g.host_id = auth.uid()::text
        )
    );

-- Players can leave games (delete their own player record)
CREATE POLICY "Players can leave games" ON players
    FOR DELETE USING (auth.uid()::text = user_id);

-- -----------------------------------------------------------------------------
-- Game actions table policies
-- -----------------------------------------------------------------------------

-- Players can view actions in their game (needed for vote tracking)
CREATE POLICY "Players can view actions in their game" ON game_actions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.game_id = game_actions.game_id 
            AND p.user_id = auth.uid()::text
        )
    );

-- Players can insert their own actions
CREATE POLICY "Players can insert their own actions" ON game_actions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.id = game_actions.player_id 
            AND p.user_id = auth.uid()::text
        )
    );

-- -----------------------------------------------------------------------------
-- Game modifiers table policies
-- -----------------------------------------------------------------------------

-- Players can view modifiers in their game
CREATE POLICY "Players can view modifiers in their game" ON game_modifiers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.game_id = game_modifiers.game_id 
            AND p.user_id = auth.uid()::text
        )
    );

-- Players can insert modifiers in their game
CREATE POLICY "Players can insert modifiers in their game" ON game_modifiers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.id = game_modifiers.created_by 
            AND p.user_id = auth.uid()::text
        )
    );

-- -----------------------------------------------------------------------------
-- Player statuses table policies
-- -----------------------------------------------------------------------------

-- Players can view statuses in their game
CREATE POLICY "Players can view statuses in their game" ON player_statuses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.game_id = player_statuses.game_id 
            AND p.user_id = auth.uid()::text
        )
    );

-- Players can insert statuses they create
CREATE POLICY "Players can insert statuses they create" ON player_statuses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.id = player_statuses.created_by 
            AND p.user_id = auth.uid()::text
        )
    );

-- Players/hosts can delete statuses in their game (for cleanup)
CREATE POLICY "Players can delete statuses in their game" ON player_statuses
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.game_id = player_statuses.game_id 
            AND p.user_id = auth.uid()::text
        )
    );

-- -----------------------------------------------------------------------------
-- Game logs table policies
-- -----------------------------------------------------------------------------

-- Game logs are viewable by players in the game (for debugging)
CREATE POLICY "Players can view logs in their game" ON game_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM players p 
            WHERE p.game_id = game_logs.game_id 
            AND p.user_id = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1 FROM games g 
            WHERE g.id = game_logs.game_id 
            AND g.host_id = auth.uid()::text
        )
    );

-- System can insert logs (service role)
CREATE POLICY "Service role can insert logs" ON game_logs
    FOR INSERT WITH CHECK (true);

-- =============================================================================
-- Service Role Bypass
-- =============================================================================
-- Note: The service role key bypasses RLS by default in Supabase.
-- Server-side operations using the service role key will have full access.
