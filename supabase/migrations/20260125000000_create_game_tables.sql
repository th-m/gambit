-- Migration: Create game tables for Gambit social deduction game
-- This migration creates all tables required for the game as specified in technical-plan.md

-- =============================================================================
-- Enable required extensions
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Create Enums
-- =============================================================================

-- gambit_game_status: Overall game state
CREATE TYPE gambit_game_status AS ENUM ('lobby', 'playing', 'finished');

-- gambit_round_status: State of a round/phase
CREATE TYPE gambit_round_status AS ENUM ('pending', 'team_selection', 'voting', 'in_progress', 'succeeded', 'failed');

-- gambit_character_alignments: Team alignment
CREATE TYPE gambit_character_alignments AS ENUM ('good', 'evil');

-- =============================================================================
-- Create profiles table (linked to auth.users)
-- =============================================================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE profiles IS 'User profiles linked to Supabase auth.users';
COMMENT ON COLUMN profiles.display_name IS 'User display name shown in games';

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, created_at)
    VALUES (NEW.id, NEW.email, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- Create Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- gambit_games: Primary table storing game state
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gambit_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_key VARCHAR(8) UNIQUE NOT NULL,
    host_id UUID NOT NULL REFERENCES profiles(id),
    status gambit_game_status DEFAULT 'lobby' NOT NULL,
    phase VARCHAR(30),
    current_round INT DEFAULT 0 NOT NULL,
    crown_index INT DEFAULT 0 NOT NULL,
    rejection_count INT DEFAULT 0 NOT NULL,
    good_victories INT DEFAULT 0 NOT NULL,
    evil_victories INT DEFAULT 0 NOT NULL,
    selected_team UUID[],
    winner VARCHAR(10) CHECK (winner IN ('good', 'evil')),
    end_reason VARCHAR(100),
    settings JSONB DEFAULT '{}' NOT NULL,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Add comment for table documentation
COMMENT ON TABLE gambit_games IS 'Primary table storing game state for Gambit social deduction game';
COMMENT ON COLUMN gambit_games.game_key IS 'Shareable 6-8 character alphanumeric join code';
COMMENT ON COLUMN gambit_games.host_id IS 'User ID of game creator';
COMMENT ON COLUMN gambit_games.status IS 'Overall game status: lobby, playing, or finished';
COMMENT ON COLUMN gambit_games.phase IS 'Current game phase within a playing game';
COMMENT ON COLUMN gambit_games.current_round IS 'Active round number (1-5)';
COMMENT ON COLUMN gambit_games.crown_index IS 'Index of current leader in player order';
COMMENT ON COLUMN gambit_games.rejection_count IS 'Consecutive leader rejections (resets after 3)';
COMMENT ON COLUMN gambit_games.good_victories IS 'Missions won by good team';
COMMENT ON COLUMN gambit_games.evil_victories IS 'Missions won by evil team';
COMMENT ON COLUMN gambit_games.selected_team IS 'Player IDs selected for current mission';
COMMENT ON COLUMN gambit_games.winner IS 'Winning team when game is finished';
COMMENT ON COLUMN gambit_games.end_reason IS 'Reason the game ended';
COMMENT ON COLUMN gambit_games.settings IS 'JSON settings for game configuration';
COMMENT ON COLUMN gambit_games.name IS 'Display name for the game';

-- -----------------------------------------------------------------------------
-- gambit_players: Players participating in games
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gambit_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES gambit_games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id),
    display_name VARCHAR(100),
    character VARCHAR(50),
    team VARCHAR(10) CHECK (team IN ('good', 'evil')),
    is_alive BOOLEAN DEFAULT TRUE NOT NULL,
    seat_order INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE (game_id, user_id)
);

COMMENT ON TABLE gambit_players IS 'Players participating in games';
COMMENT ON COLUMN gambit_players.game_id IS 'Associated game (foreign key)';
COMMENT ON COLUMN gambit_players.user_id IS 'User ID of the player';
COMMENT ON COLUMN gambit_players.display_name IS 'Shown to other players';
COMMENT ON COLUMN gambit_players.character IS 'Assigned character name (null until game starts)';
COMMENT ON COLUMN gambit_players.team IS 'Team alignment: good or evil (null until game starts)';
COMMENT ON COLUMN gambit_players.is_alive IS 'Whether player is still in the game';
COMMENT ON COLUMN gambit_players.seat_order IS 'Position in turn order (0 to N-1)';

-- -----------------------------------------------------------------------------
-- gambit_game_actions: Audit log of all player actions and votes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gambit_game_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES gambit_games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES gambit_players(id),
    action_type VARCHAR(50) NOT NULL,
    target_ids UUID[],
    round INT,
    phase VARCHAR(30),
    metadata JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE gambit_game_actions IS 'Audit log of all player actions and votes';
COMMENT ON COLUMN gambit_game_actions.action_type IS 'Type of action: vote_yes, vote_no, assassinate, etc.';
COMMENT ON COLUMN gambit_game_actions.target_ids IS 'Target player IDs if applicable';
COMMENT ON COLUMN gambit_game_actions.round IS 'Round when action occurred';
COMMENT ON COLUMN gambit_game_actions.phase IS 'Phase when action occurred';
COMMENT ON COLUMN gambit_game_actions.metadata IS 'Additional data for the action';

-- -----------------------------------------------------------------------------
-- gambit_game_modifiers: Temporary effects on game state
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gambit_game_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES gambit_games(id) ON DELETE CASCADE,
    round INT NOT NULL,
    modifier_type VARCHAR(50) NOT NULL,
    created_by UUID REFERENCES gambit_players(id),
    metadata JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE gambit_game_modifiers IS 'Temporary effects on game state (e.g., rigged votes)';
COMMENT ON COLUMN gambit_game_modifiers.round IS 'Round this modifier applies to';
COMMENT ON COLUMN gambit_game_modifiers.modifier_type IS 'Type: force_pass, extra_fail, etc.';
COMMENT ON COLUMN gambit_game_modifiers.created_by IS 'Player who created the modifier';
COMMENT ON COLUMN gambit_game_modifiers.metadata IS 'Additional data for the modifier';

-- -----------------------------------------------------------------------------
-- gambit_player_statuses: Temporary statuses on players
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gambit_player_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES gambit_games(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES gambit_players(id) ON DELETE CASCADE,
    status_type VARCHAR(50) NOT NULL,
    created_by UUID REFERENCES gambit_players(id),
    metadata JSONB DEFAULT '{}' NOT NULL,
    expires_at_round INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE gambit_player_statuses IS 'Temporary statuses on players (e.g., protected, beepered)';
COMMENT ON COLUMN gambit_player_statuses.status_type IS 'Type: protected, beepered, etc.';
COMMENT ON COLUMN gambit_player_statuses.created_by IS 'Player who applied the status';
COMMENT ON COLUMN gambit_player_statuses.expires_at_round IS 'Round when status expires (null = permanent until removed)';

-- -----------------------------------------------------------------------------
-- gambit_game_logs: Debug/analytics logging
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gambit_game_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES gambit_games(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    phase VARCHAR(30),
    round INT,
    duration_ms INT,
    metadata JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE gambit_game_logs IS 'Debug/analytics logging for game events';
COMMENT ON COLUMN gambit_game_logs.action IS 'Event name';
COMMENT ON COLUMN gambit_game_logs.duration_ms IS 'Processing time in milliseconds';

-- =============================================================================
-- Create Indexes
-- =============================================================================

-- gambit_games.game_key - unique index for fast lookups by join code
CREATE UNIQUE INDEX IF NOT EXISTS idx_gambit_games_game_key ON gambit_games(game_key);

-- gambit_players.game_id, user_id (composite) - for finding players in a game
CREATE INDEX IF NOT EXISTS idx_gambit_players_game_user ON gambit_players(game_id, user_id);

-- gambit_game_actions.game_id, round, phase (composite) - for querying actions by round/phase
CREATE INDEX IF NOT EXISTS idx_gambit_game_actions_game_round_phase ON gambit_game_actions(game_id, round, phase);

-- gambit_player_statuses.game_id, player_id, status_type (composite) - for status lookups
CREATE INDEX IF NOT EXISTS idx_gambit_player_statuses_game_player_status ON gambit_player_statuses(game_id, player_id, status_type);

-- Additional useful indexes for performance
CREATE INDEX IF NOT EXISTS idx_gambit_games_status ON gambit_games(status);
CREATE INDEX IF NOT EXISTS idx_gambit_players_game_id ON gambit_players(game_id);
CREATE INDEX IF NOT EXISTS idx_gambit_game_actions_game_id ON gambit_game_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_gambit_game_modifiers_game_round ON gambit_game_modifiers(game_id, round);

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambit_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambit_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambit_game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambit_game_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambit_player_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambit_game_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Profiles table policies
-- -----------------------------------------------------------------------------

-- Users can read any profile (for display names)
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- Games table policies
-- -----------------------------------------------------------------------------

-- Players in game can read game state
CREATE POLICY "Players in game can read game" ON gambit_games
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.game_id = gambit_games.id 
            AND p.user_id = auth.uid()
        )
        OR host_id = auth.uid()
    );

-- Authenticated users can create games
CREATE POLICY "Authenticated users can create games" ON gambit_games
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only host can update game state
CREATE POLICY "Hosts can update their games" ON gambit_games
    FOR UPDATE USING (host_id = auth.uid());

-- Only host can delete their game
CREATE POLICY "Hosts can delete their games" ON gambit_games
    FOR DELETE USING (host_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Players table policies
-- -----------------------------------------------------------------------------

-- Players can read other players in same game
CREATE POLICY "Players can view other players in same game" ON gambit_players
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.game_id = gambit_players.game_id 
            AND p.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM gambit_games g 
            WHERE g.id = gambit_players.game_id 
            AND g.host_id = auth.uid()
        )
    );

-- Users can insert themselves into games (join)
CREATE POLICY "Users can join games" ON gambit_players
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Players can update their own player record
CREATE POLICY "Players can update themselves" ON gambit_players
    FOR UPDATE USING (user_id = auth.uid());

-- Host can update any player in their game (for character assignment)
CREATE POLICY "Host can update players in their game" ON gambit_players
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM gambit_games g 
            WHERE g.id = gambit_players.game_id 
            AND g.host_id = auth.uid()
        )
    );

-- Users can only delete their own player record (leave)
CREATE POLICY "Players can leave games" ON gambit_players
    FOR DELETE USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Game actions table policies
-- -----------------------------------------------------------------------------

-- Players in game can read actions (for vote counts)
CREATE POLICY "Players can view actions in their game" ON gambit_game_actions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.game_id = gambit_game_actions.game_id 
            AND p.user_id = auth.uid()
        )
    );

-- Players can only insert actions for themselves
CREATE POLICY "Players can insert their own actions" ON gambit_game_actions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.id = gambit_game_actions.player_id 
            AND p.user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- Game modifiers table policies
-- -----------------------------------------------------------------------------

-- Players in game can read modifiers
CREATE POLICY "Players can view modifiers in their game" ON gambit_game_modifiers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.game_id = gambit_game_modifiers.game_id 
            AND p.user_id = auth.uid()
        )
    );

-- Only server/host can insert modifiers (service role or host)
CREATE POLICY "Host can insert modifiers" ON gambit_game_modifiers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM gambit_games g 
            WHERE g.id = gambit_game_modifiers.game_id 
            AND g.host_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- Player statuses table policies
-- -----------------------------------------------------------------------------

-- Players can read their own statuses
CREATE POLICY "Players can view their own statuses" ON gambit_player_statuses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.id = gambit_player_statuses.player_id 
            AND p.user_id = auth.uid()
        )
    );

-- Status creators can read statuses they created
CREATE POLICY "Creators can view statuses they created" ON gambit_player_statuses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.id = gambit_player_statuses.created_by 
            AND p.user_id = auth.uid()
        )
    );

-- Players can insert statuses they create
CREATE POLICY "Players can insert statuses they create" ON gambit_player_statuses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.id = gambit_player_statuses.created_by 
            AND p.user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- Game logs table policies
-- -----------------------------------------------------------------------------

-- Game logs are viewable by players/host in the game (for debugging)
CREATE POLICY "Players can view logs in their game" ON gambit_game_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM gambit_players p 
            WHERE p.game_id = gambit_game_logs.game_id 
            AND p.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM gambit_games g 
            WHERE g.id = gambit_game_logs.game_id 
            AND g.host_id = auth.uid()
        )
    );

-- System can insert logs (service role)
CREATE POLICY "Service role can insert logs" ON gambit_game_logs
    FOR INSERT WITH CHECK (true);

-- =============================================================================
-- Service Role Bypass
-- =============================================================================
-- Note: The service role key bypasses RLS by default in Supabase.
-- Server-side operations using the service role key will have full access.
