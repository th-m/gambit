# Supabase Database Setup - Task Tracking

Set up the complete Supabase database schema for the Gambit social deduction game.

## Overview

This task creates all database tables, enums, indexes, RLS policies, and real-time configuration as specified in `technical-plan.md`.

## Feature Categories

| Category | Count | Description |
|----------|-------|-------------|
| tables | 7 | Core database tables |
| indexes | 4 | Performance indexes |
| rls | 6 | Row Level Security policies |
| realtime | 4 | Real-time replication config |

## Tables to Create

### Core Tables
- `profiles` - User profiles linked to auth.users
- `gambit_games` - Game state and configuration
- `gambit_players` - Players in games with character assignments
- `gambit_game_actions` - Audit log of all player actions/votes
- `gambit_game_modifiers` - Temporary effects on game state
- `gambit_player_statuses` - Temporary statuses on players
- `gambit_game_logs` - Debug/analytics logging

### Enums
- `gambit_game_status` - lobby, playing, finished
- `gambit_round_status` - pending, team_selection, voting, in_progress, succeeded, failed
- `gambit_character_alignments` - good, evil

## Getting Started

```bash
# Review the feature list
cat .agent-tasks/supabase-database-setup/feature-list.json

# Check progress
cat .agent-tasks/supabase-database-setup/agent-progress.txt
```

## Files

- `feature-list.json` - All features with acceptance criteria
- `agent-progress.txt` - Session-by-session work log
- `README.md` - This file
