# Gambit Social Deduction Game - Task Tracking

A web-based multiplayer social deduction game inspired by Avalon, Coup, and Salem.

## Overview

This task tracks the implementation of the full game system as specified in `technical-plan.md`.

## Feature Categories

| Category | Count | Description |
|----------|-------|-------------|
| functional | 68 | Core game logic, services, components, APIs |
| visual | 9 | UI/UX, styling, responsive design |
| performance | 2 | Real-time efficiency, bundle optimization |
| security | 4 | Server validation, data privacy, rate limiting |
| accessibility | 2 | Keyboard navigation, screen reader support |

## Priority Levels

- **Priority 1**: Core infrastructure - types, registries, services, APIs
- **Priority 2**: UI components, visual design, end-to-end tests
- **Priority 3**: Polish, animations, edge case handling

## Key Technical Components

### Backend Services
- `GameService` - CRUD operations for games and players
- `VoteProcessor` - Vote handling and resolution
- `ActionProcessor` - Special ability execution
- `StateValidator` - Game state transition validation

### Registry System
- `ActionRegistry` - Character action definitions
- `EffectRegistry` - Passive effect definitions
- `CharacterRegistry` - Character definitions and info resolution
- `EventBus` - Game event pub/sub system

### Frontend
- `GameFlowContext` - Centralized game state management
- Custom hooks for real-time subscriptions
- Phase-specific components for game flow

## Game Characters

### Good Team
- Seer - Knows all evil players
- Oracle - Knows who the Seer is
- Guardian - Can protect players from assassination
- Tracker - Can plant beepers on players
- Villager - Basic good player

### Evil Team
- Assassin - Can eliminate players, wins by killing Seer
- Fixer - Can rig votes to force pass
- Phantom - Appears as Seer to Oracle
- Saboteur - Appears as good to Seer, can add fail votes
- Minion - Basic evil player

## Getting Started

```bash
# Review the feature list
cat .agent-tasks/gambit-social-deduction-game/feature-list.json

# Check progress
cat .agent-tasks/gambit-social-deduction-game/agent-progress.txt
```

## Files

- `feature-list.json` - All features with acceptance criteria
- `agent-progress.txt` - Session-by-session work log
- `README.md` - This file
