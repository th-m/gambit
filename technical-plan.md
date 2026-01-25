# Social Deduction Game - Technical Plan

## Executive Summary

A web-based multiplayer social deduction game inspired by Avalon, Coup, and Salem. Players are randomly assigned roles and teams (Good vs Evil) and must complete missions while deducing who is on which team. The game leverages real-time communication and device-specific features (like vibration) enabled by a digital-first approach.

---

## Technology Stack

### Frontend
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| React 18+ | UI Framework | Component-based architecture, large ecosystem |
| React Router 7 (Framework Mode) | Routing & SSR | Unified client/server routing, built-in loaders/actions for API endpoints |
| Aceternity UI | Design Components | Pre-built animated components |
| shadcn/ui | UI Components | Accessible, customizable component library |
| TypeScript | Type Safety | Compile-time error checking, improved DX |

### Backend
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| React Router (Framework Mode) | API Routes | Co-located with pages, type-safe loaders/actions |
| Supabase | Database & Real-time | PostgreSQL with real-time subscriptions, authentication helpers |
| Clerk | Authentication | Easy integration with React Router, social logins |

### Infrastructure
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| Netlify | Hosting | Serverless functions, edge deployment, easy CI/CD |
| Supabase | Database Hosting | Managed PostgreSQL, real-time infrastructure |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│  React Components ──► React Router ──► Supabase Real-time       │
│       │                    │                   │                 │
│       ▼                    ▼                   ▼                 │
│  Game UI/State      API Calls (fetch)    WebSocket Subscriptions│
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Netlify Edge/Functions                        │
├─────────────────────────────────────────────────────────────────┤
│  React Router Server ──► Route Handlers ──► Server Services     │
│                               │                                  │
│                               ▼                                  │
│                      Supabase Service Client                     │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL Database ◄──► Real-time Engine ◄──► Auth            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables

#### `games`
Primary table storing game state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Unique game identifier |
| game_key | varchar(8) | UNIQUE, NOT NULL | Shareable join code |
| host_id | varchar(255) | NOT NULL | Clerk user ID of game creator |
| status | varchar(20) | DEFAULT 'lobby' | 'lobby', 'playing', 'finished' |
| phase | varchar(30) | | Current game phase |
| current_round | int | DEFAULT 0 | Active round number (1-5) |
| crown_index | int | DEFAULT 0 | Index of current leader in player order |
| rejection_count | int | DEFAULT 0 | Consecutive leader rejections |
| good_victories | int | DEFAULT 0 | Missions won by good team |
| evil_victories | int | DEFAULT 0 | Missions won by evil team |
| selected_team | uuid[] | | Player IDs selected for current mission |
| winner | varchar(10) | | 'good' or 'evil' when finished |
| end_reason | varchar(100) | | Reason game ended |
| created_at | timestamp | DEFAULT now() | |

#### `players`
Players participating in games.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Unique player identifier |
| game_id | uuid | FK → games.id ON DELETE CASCADE | Associated game |
| user_id | varchar(255) | NOT NULL | Clerk user ID |
| display_name | varchar(100) | | Shown to other players |
| character | varchar(50) | | Assigned character name |
| team | varchar(10) | | 'good' or 'evil' |
| is_alive | boolean | DEFAULT true | Whether player is eliminated |
| seat_order | int | | Position in turn order |
| created_at | timestamp | DEFAULT now() | |

#### `game_actions`
Audit log of all player actions and votes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| game_id | uuid | FK → games.id ON DELETE CASCADE | |
| player_id | uuid | FK → players.id | Acting player |
| action_type | varchar(50) | NOT NULL | 'vote_yes', 'vote_no', 'assassinate', etc. |
| target_ids | uuid[] | | Target player IDs if applicable |
| round | int | | Round when action occurred |
| phase | varchar(30) | | Phase when action occurred |
| created_at | timestamp | DEFAULT now() | |

#### `game_modifiers`
Temporary effects on game state (e.g., rigged votes).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| game_id | uuid | FK → games.id ON DELETE CASCADE | |
| round | int | NOT NULL | Round this modifier applies to |
| modifier_type | varchar(50) | NOT NULL | 'force_pass', 'extra_fail', etc. |
| created_by | uuid | FK → players.id | Player who created modifier |
| metadata | jsonb | DEFAULT '{}' | Additional data |
| created_at | timestamp | DEFAULT now() | |

#### `player_statuses`
Temporary statuses on players (e.g., protected, beepered).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| game_id | uuid | FK → games.id ON DELETE CASCADE | |
| player_id | uuid | FK → players.id ON DELETE CASCADE | |
| status_type | varchar(50) | NOT NULL | 'protected', 'beepered', etc. |
| created_by | uuid | FK → players.id | Player who applied status |
| metadata | jsonb | DEFAULT '{}' | Additional data |
| expires_at_round | int | | Round when status expires |
| created_at | timestamp | DEFAULT now() | |

#### `game_logs`
Debug/analytics logging.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| game_id | uuid | FK → games.id ON DELETE CASCADE | |
| action | varchar(100) | NOT NULL | Event name |
| phase | varchar(30) | | |
| round | int | | |
| duration_ms | int | | Processing time |
| metadata | jsonb | DEFAULT '{}' | |
| created_at | timestamp | DEFAULT now() | |

### Supabase Real-time Configuration
Enable replication for tables: `games`, `players`, `game_actions`, `player_statuses`

### Indexes
- `games.game_key` (unique)
- `players.game_id, user_id` (composite)
- `game_actions.game_id, round, phase` (composite)
- `player_statuses.game_id, player_id, status_type` (composite)

---

## Game Data Structures

### Characters

Each character has:
- **name**: Unique identifier
- **team**: 'good' or 'evil'
- **description**: Player-facing explanation
- **info**: What information this character receives at game start
- **actions**: Special abilities available to this character
- **effects**: Passive modifiers affecting how others perceive this character

#### Good Team Characters

| Name | Info | Actions | Effects |
|------|------|---------|---------|
| Seer | Knows all evil players | None | None |
| Oracle | Knows who the Seer is | None | None (but sees Phantom as Seer) |
| Guardian | None | protect | None |
| Tracker | None | plant_beeper | None |
| Villager | None | None | None |

#### Evil Team Characters

| Name | Info | Actions | Effects |
|------|------|---------|---------|
| Assassin | Knows other evil players | assassinate | None |
| Fixer | Knows other evil players | rig_vote | None |
| Phantom | Knows other evil players | None | Appears as Seer to Oracle |
| Saboteur | Knows other evil players | sabotage | Appears as good to Seer |
| Minion | Knows other evil players | None | None |

### Actions

| Action | Uses | Phases | Requirements | Effect |
|--------|------|--------|--------------|--------|
| assassinate | 1 | mission_voting, assassination | None (on team for mission phase) | Eliminate target. If Seer, evil wins immediately. |
| rig_vote | 1 | mission_voting | None | Force all mission votes to pass |
| plant_beeper | 1 | selecting_team | Must select 1 good + 1 evil | Tagged players' devices vibrate on vote reveal |
| protect | 1 | mission_voting | None | Target cannot be assassinated this round |
| sabotage | 1 | mission_voting | Must be on team | Add one extra fail vote |

### Effects

| Effect | Description | Implementation |
|--------|-------------|----------------|
| appears_as_seer | Character shows as Seer to Oracle | Modify info resolution for Oracle |
| appears_as_good | Character shows as good to Seer | Modify info resolution for Seer |

### Team Compositions

| Players | Good | Evil |
|---------|------|------|
| 5 | 3 | 2 |
| 6 | 4 | 2 |
| 7 | 4 | 3 |
| 8 | 5 | 3 |
| 9 | 6 | 3 |
| 10 | 6 | 4 |

### Mission Sizes

| Players | R1 | R2 | R3 | R4 | R5 |
|---------|----|----|----|----|-----|
| 5 | 2 | 3 | 2 | 3 | 3 |
| 6 | 2 | 3 | 4 | 3 | 4 |
| 7 | 2 | 3 | 3 | 4 | 4 |
| 8 | 3 | 4 | 4 | 5 | 5 |
| 9 | 3 | 4 | 4 | 5 | 5 |
| 10 | 3 | 4 | 4 | 5 | 5 |

### Special Rules
- Round 4 with 7+ players requires 2 fail votes for mission to fail
- 3 consecutive leader rejections = automatic mission failure for evil

---

## Game Flow

### Phases

```
┌──────────────┐
│    LOBBY     │ ─── Players join, host starts game
└──────┬───────┘
       ▼
┌──────────────┐
│VOTING_FOR_   │ ─── Players vote yes/no on current crown holder
│   LEADER     │     If approved → selecting_team
└──────┬───────┘     If rejected → crown moves, rejection_count++
       │             If 3 rejections → evil gets point, next round
       ▼
┌──────────────┐
│ SELECTING_   │ ─── Leader picks mission team
│    TEAM      │     Actions: plant_beeper available
└──────┬───────┘
       ▼
┌──────────────┐
│   MISSION_   │ ─── Team members vote pass/fail
│   VOTING     │     Actions: assassinate, protect, rig_vote, sabotage
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ RESOLUTION   │ ─── Tally votes, update scores
└──────┬───────┘     Check win conditions
       │
       ├─── Good wins 3 + Assassin alive → ASSASSINATION
       ├─── Good wins 3, no Assassin → Good wins
       ├─── Evil wins 3 → Evil wins
       └─── Otherwise → Next round (VOTING_FOR_LEADER)

┌──────────────┐
│ASSASSINATION │ ─── Assassin gets one chance to kill Seer
└──────────────┘     If correct → Evil wins
                     If wrong → Good wins
```

### Win Conditions

| Condition | Winner | Reason |
|-----------|--------|--------|
| Good completes 3 missions (and survives assassination) | Good | "Good completed 3 successful missions" |
| Evil fails 3 missions | Evil | "Evil sabotaged 3 missions" |
| Assassin kills Seer | Evil | "Seer assassinated" |
| All evil eliminated | Good | "All evil players eliminated" |
| Evil has majority alive | Evil | "Evil has majority control" |

---

## Project Structure

```
app/
├── routes/
│   ├── _index.tsx                    # Home - Start/Join game
│   ├── lobby.$gameKey.tsx            # Pre-game lobby
│   ├── game.$gameKey.tsx             # Main game interface
│   └── api/
│       ├── games.create.ts           # POST - Create new game
│       ├── games.$gameId.join.ts     # POST - Join existing game
│       ├── games.$gameId.start.ts    # POST - Start game (host only)
│       ├── games.$gameId.vote.ts     # POST - Submit vote
│       ├── games.$gameId.team.ts     # POST - Select team
│       └── games.$gameId.action.ts   # POST - Execute special action
├── routes.ts                          # Route configuration
├── root.tsx                           # App root with providers
├── entry.client.tsx
├── entry.server.tsx
│
├── components/
│   ├── ui/                            # shadcn components
│   ├── game/
│   │   ├── Lobby.tsx
│   │   ├── GameBoard.tsx
│   │   ├── LeaderVoting.tsx
│   │   ├── TeamSelection.tsx
│   │   ├── MissionVoting.tsx
│   │   ├── AssassinationPhase.tsx
│   │   ├── ActionPanel.tsx
│   │   ├── TargetSelector.tsx
│   │   ├── CharacterInfoPanel.tsx
│   │   ├── ScoreBoard.tsx
│   │   ├── PlayerList.tsx
│   │   ├── VoteResults.tsx
│   │   └── GameOver.tsx
│   └── layout/
│       └── Navbar.tsx
│
├── context/
│   └── GameFlowContext.tsx            # Game state provider
│
├── hooks/
│   ├── useGameSubscription.ts         # Real-time game state
│   ├── useVoteSubscription.ts         # Real-time vote tracking
│   ├── useVoteCompletion.ts           # Vote completion detection
│   ├── useVibration.ts                # Device vibration API
│   └── useGameApi.ts                  # API call helpers
│
├── server/
│   ├── supabase.server.ts             # Server Supabase client
│   ├── auth.server.ts                 # Auth helpers
│   ├── game/
│   │   ├── GameService.ts             # CRUD operations
│   │   ├── VoteProcessor.ts           # Vote handling logic
│   │   ├── ActionProcessor.ts         # Action execution
│   │   └── StateValidator.ts          # State validation
│   └── middleware/
│       └── auth.ts
│
├── registry/
│   ├── ActionRegistry.ts              # Action definitions
│   ├── EffectRegistry.ts              # Effect definitions
│   ├── CharacterRegistry.ts           # Character definitions
│   └── EventBus.ts                    # Event system
│
├── characters/
│   ├── index.ts                       # Registration
│   ├── seer.ts
│   ├── oracle.ts
│   ├── guardian.ts
│   ├── tracker.ts
│   ├── villager.ts
│   ├── assassin.ts
│   ├── fixer.ts
│   ├── phantom.ts
│   ├── saboteur.ts
│   └── minion.ts
│
├── actions/
│   ├── assassinate.ts
│   ├── rigVote.ts
│   ├── plantBeeper.ts
│   ├── protect.ts
│   └── sabotage.ts
│
├── effects/
│   ├── appearsAsSeer.ts
│   ├── appearsAsGood.ts
│   └── beeperVibrate.ts
│
├── lib/
│   ├── supabase.ts                    # Client Supabase
│   ├── gameUtils.ts                   # Utilities
│   ├── characterAssignment.ts         # Character distribution
│   └── initializeGame.ts              # Registry initialization
│
├── types/
│   ├── game.ts                        # Game types
│   ├── actions.ts                     # Action/Effect types
│   └── database.ts                    # Supabase generated types
│
└── styles/
    └── globals.css
```

---

## Component Specifications

### Page Components

#### `_index.tsx` (Home)
**Purpose**: Entry point for authentication and game creation/joining.

**Responsibilities**:
- Display sign-in button for unauthenticated users (via Clerk)
- Show "Start New Game" button for authenticated users
- Provide game code input for joining existing games
- Handle navigation to lobby after create/join

**State**:
- `gameKey: string` - Input for join code
- `isCreating: boolean` - Loading state for create
- `isJoining: boolean` - Loading state for join

**Testing**:
- Renders sign-in for unauthenticated users
- Creates game and redirects to lobby
- Validates game code format before join attempt
- Handles API errors gracefully

---

#### `lobby.$gameKey.tsx` (Lobby)
**Purpose**: Pre-game waiting room where players gather before starting.

**Responsibilities**:
- Display shareable game code and copy link functionality
- Show list of joined players with real-time updates
- Allow host to start game when player count is valid (5-10)
- Allow players to leave the lobby
- Redirect to game when status changes to 'playing'

**Loader**:
- Fetch game by key, redirect if not found or already playing
- Fetch players list
- Identify current player and host status

**Testing**:
- Displays correct game code
- Copy link copies correct URL to clipboard
- Player list updates in real-time when others join
- Start button disabled with fewer than 5 players
- Only host sees start button
- Redirects when game starts

---

#### `game.$gameKey.tsx` (Game)
**Purpose**: Main game interface during active gameplay.

**Responsibilities**:
- Wrap content in `GameFlowProvider` for state management
- Render phase-appropriate component
- Display character info panel
- Display action panel when actions available
- Show game over screen when finished

**Loader**:
- Validate user is authenticated and in game
- Redirect to lobby if game not started
- Fetch initial game and player state

**Testing**:
- Renders correct phase component
- Shows character-specific information
- Handles real-time state updates
- Displays winner on game end

---

### Game Components

#### `Lobby.tsx`
**Purpose**: UI for the pre-game lobby.

**Props**:
- `game: Game`
- `players: Player[]`
- `currentPlayer: Player`
- `isHost: boolean`

**Responsibilities**:
- Display game code with copy functionality
- Render player list with host indicator
- Show player count and requirements
- Handle start game action (host only)
- Handle leave game action

**Testing**:
- Displays all joined players
- Shows host badge correctly
- Start button state reflects player count
- Copy button updates text on success

---

#### `GameBoard.tsx`
**Purpose**: Main game container that routes to phase-specific views.

**Responsibilities**:
- Subscribe to real-time game updates via context
- Render ScoreBoard with current standings
- Conditionally render phase component:
  - `voting_for_leader` → `LeaderVoting`
  - `selecting_team` → `TeamSelection`
  - `mission_voting` → `MissionVoting`
  - `assassination` → `AssassinationPhase`
- Render `CharacterInfoPanel` in sidebar
- Render `ActionPanel` when actions available
- Initialize vibration listener for beepered players

**Testing**:
- Renders correct component for each phase
- Updates when phase changes
- Shows loading state during transitions

---

#### `LeaderVoting.tsx`
**Purpose**: Interface for approving/rejecting the current leader.

**Responsibilities**:
- Display current crown holder's name
- Show rejection count (X/3)
- Provide Approve/Reject buttons
- Track vote submission state
- Display waiting message after voting
- Show vote results when all votes in
- Trigger vote processing on completion

**State**:
- `hasVoted: boolean`
- Vote counts from subscription

**Testing**:
- Buttons disabled after voting
- Shows correct rejection count
- Displays results when all voted
- Handles rapid double-click prevention

---

#### `TeamSelection.tsx`
**Purpose**: Interface for leader to select mission team.

**Props/Context**:
- Current game state
- Whether current user is leader

**Responsibilities**:
- Display required team size for current round
- Show selectable player grid (alive players only)
- Track selected players with visual feedback
- Enforce selection limit
- Submit team selection
- Show waiting state for non-leaders

**State**:
- `selectedIds: string[]`

**Testing**:
- Only leader can select
- Cannot exceed team size
- Cannot select eliminated players
- Confirm button disabled until correct count
- Non-leaders see waiting message

---

#### `MissionVoting.tsx`
**Purpose**: Interface for team members to vote pass/fail.

**Responsibilities**:
- Identify if current player is on team
- Display Pass button (all players)
- Display Fail button (evil players only)
- Show vote progress
- Display shuffled results on completion
- Trigger mission resolution

**Testing**:
- Good players cannot vote fail
- Non-team members see waiting state
- Results display shuffled (no attribution)
- Handles vote modifiers (rig_vote)

---

#### `AssassinationPhase.tsx`
**Purpose**: Final chance for Assassin to identify Seer.

**Responsibilities**:
- Identify if current player is Assassin
- Display player selection for Assassin
- Show waiting state for others
- Submit assassination target
- Display result (game end)

**Testing**:
- Only Assassin can select target
- Correct target ends game for evil
- Wrong target ends game for good

---

#### `ActionPanel.tsx`
**Purpose**: Floating panel for special character actions.

**Props**:
- `ctx: GameContext`
- `characterActions: string[]`
- `usedActions: string[]`

**Responsibilities**:
- Filter available actions based on current phase
- Filter out already-used actions (for limited use)
- Display action buttons
- Handle action selection flow
- Integrate with `TargetSelector` when targets needed
- Submit action execution
- Show confirmation/result

**Testing**:
- Only shows phase-appropriate actions
- Hides used one-time actions
- Target selector appears when needed
- Handles execution errors

---

#### `TargetSelector.tsx`
**Purpose**: Reusable component for selecting action targets.

**Props**:
- `ctx: GameContext`
- `action: ActionDefinition`
- `selected: Player[]`
- `onChange: (targets: Player[]) => void`

**Responsibilities**:
- Filter eligible targets based on action requirements
- Display player grid with selection state
- Enforce target count limits
- Validate target requirements (e.g., "one good, one evil")

**Testing**:
- Filters out ineligible players
- Enforces count limits
- Visual feedback on selection

---

#### `CharacterInfoPanel.tsx`
**Purpose**: Display character identity and known information.

**Props**:
- `ctx: GameContext`

**Responsibilities**:
- Display character name and team
- Show character description
- Render resolved information (accounting for effects)
- Indicate unreliable info (e.g., Phantom appearing as Seer)

**Testing**:
- Shows correct character info
- Applies effect modifiers to displayed info
- Marks unreliable info appropriately

---

#### `ScoreBoard.tsx`
**Purpose**: Display current game standings.

**Props**:
- `game: Game`

**Responsibilities**:
- Show round indicators (1-5)
- Display good vs evil victory counts
- Highlight current round
- Show mission results for completed rounds

**Testing**:
- Displays correct victory counts
- Visual indication of progress

---

#### `PlayerList.tsx`
**Purpose**: Reusable list of players with status indicators.

**Props**:
- `players: Player[]`
- `crownIndex?: number`
- `selectedTeam?: string[]`
- `showStatus?: boolean`

**Responsibilities**:
- Display player names
- Show crown icon for leader
- Indicate team selection state
- Show eliminated status
- Optional: show alive/dead status

---

#### `VoteResults.tsx`
**Purpose**: Display vote tally after completion.

**Props**:
- `tally: Record<string, number>`
- `voteType: 'leader' | 'mission'`
- `onContinue: () => void`

**Responsibilities**:
- Display vote counts
- Show pass/fail or approve/reject result
- Animate reveal
- Provide continue button

---

#### `GameOver.tsx`
**Purpose**: End game screen with results.

**Props**:
- `game: Game`
- `players: Player[]`

**Responsibilities**:
- Display winning team
- Show end reason
- Reveal all player roles
- Provide "Play Again" / "Return Home" options

---

### Context & Hooks

#### `GameFlowContext.tsx`
**Purpose**: Centralized game state management and API access.

**Provides**:
- `game: Game | null`
- `players: Player[]`
- `ctx: GameContext | null`
- `isLoading: boolean`
- `error: Error | null`
- `submitLeaderVote(approve: boolean): Promise<void>`
- `selectTeam(playerIds: string[]): Promise<void>`
- `submitMissionVote(vote: 'pass' | 'fail'): Promise<void>`
- `executeAction(actionId: string, targetIds: string[]): Promise<void>`

**Responsibilities**:
- Initialize Supabase subscriptions
- Maintain synchronized game state
- Provide API methods to components
- Handle cleanup on unmount

**Testing**:
- Initializes subscriptions on mount
- Updates state on real-time events
- Cleans up subscriptions on unmount
- API methods call correct endpoints

---

#### `useGameSubscription.ts`
**Purpose**: Subscribe to real-time game state changes.

**Parameters**:
- `gameId: string`

**Returns**:
- `game: Game | null`
- `players: Player[]`
- `actions: GameAction[]`

**Responsibilities**:
- Fetch initial state
- Subscribe to games table changes
- Subscribe to players table changes
- Subscribe to game_actions table changes
- Update state on events
- Cleanup on unmount

**Testing**:
- Returns initial state after fetch
- Updates on INSERT/UPDATE/DELETE events
- Unsubscribes on unmount

---

#### `useVoteSubscription.ts`
**Purpose**: Track votes for specific round/phase.

**Parameters**:
- `gameId: string`
- `round: number`
- `phase: string`

**Returns**:
- `votes: Record<string, string>`

**Responsibilities**:
- Fetch existing votes for round/phase
- Subscribe to new vote actions
- Filter votes by round/phase
- Update vote map in real-time

---

#### `useVoteCompletion.ts`
**Purpose**: Detect when all votes are in and trigger processing.

**Responsibilities**:
- Monitor vote count vs expected voters
- Trigger server-side processing on completion
- Handle leader voting completion
- Handle mission voting completion

---

#### `useVibration.ts`
**Purpose**: Listen for and trigger device vibration.

**Parameters**:
- `gameId: string`
- `playerId: string`

**Responsibilities**:
- Subscribe to vibration broadcast channel
- Check if current player is in vibration targets
- Trigger navigator.vibrate() API
- Handle devices without vibration support

**Testing**:
- Subscribes to correct channel
- Only vibrates for targeted players
- Graceful degradation without API support

---

#### `useGameApi.ts`
**Purpose**: Provide typed API call methods.

**Returns**:
- `loading: boolean`
- `error: string | null`
- `submitVote(gameId, voteType, vote): Promise<Result>`
- `selectTeam(gameId, teamIds): Promise<Result>`
- `executeAction(gameId, actionId, targetIds): Promise<Result>`
- `startGame(gameId): Promise<Result>`

**Responsibilities**:
- Manage loading/error state
- Make fetch calls to API routes
- Parse responses
- Handle errors

---

## Server Service Specifications

### `GameService.ts`
**Purpose**: CRUD operations for games and players.

**Methods**:

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `createGame` | hostId: string | { game, gameKey } | Create new game in lobby status |
| `getGameByKey` | gameKey: string | Game \| null | Find game by shareable code |
| `getGameById` | gameId: string | Game \| null | Find game by UUID |
| `getPlayers` | gameId: string | Player[] | Get all players in game |
| `getPlayer` | gameId, userId: string | Player \| null | Get specific player |
| `addPlayer` | gameId, userId, displayName | Player | Add player to game |
| `removePlayer` | gameId, userId | void | Remove player from game |
| `updateGame` | gameId, updates: Partial\<Game\> | Game | Update game state |
| `updatePlayer` | playerId, updates: Partial\<Player\> | Player | Update player state |

**Testing**:
- Creates game with valid game_key
- Generates unique game keys
- Handles duplicate player join gracefully
- Updates return updated entity

---

### `VoteProcessor.ts`
**Purpose**: Handle vote submission and resolution logic.

**Methods**:

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `submitLeaderVote` | gameId, playerId, vote | VoteResult | Record and process leader vote |
| `submitMissionVote` | gameId, playerId, vote | VoteResult | Record and process mission vote |

**Internal Methods**:
- `checkLeaderVoteCompletion` - Tally and resolve leader votes
- `processLeaderVoteResult` - Update game state based on approval/rejection
- `checkMissionVoteCompletion` - Tally and resolve mission votes
- `processMissionResult` - Update scores, check win conditions
- `triggerBeeperVibration` - Send vibration broadcast
- `cleanupRound` - Remove expired statuses/modifiers

**VoteResult Interface**:
```typescript
interface VoteResult {
  success: boolean;
  allVotesIn: boolean;
  result?: 'approved' | 'rejected' | 'mission_pass' | 'mission_fail';
  tally?: Record<string, number>;
  error?: string;
}
```

**Testing**:
- Prevents duplicate voting
- Good players cannot vote fail on missions
- Non-team members cannot vote on missions
- Correct phase validation
- Applies vote modifiers (rig_vote)
- Handles 3-rejection auto-fail
- Triggers assassination phase when appropriate
- Correctly calculates 2-fail requirement for round 4

---

### `ActionProcessor.ts`
**Purpose**: Execute special character abilities.

**Methods**:

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `executeAction` | gameId, playerId, actionId, targetIds | ActionResult | Validate and execute action |
| `registerHandler` | ActionHandler | void | Add new action type |

**ActionResult Interface**:
```typescript
interface ActionResult {
  success: boolean;
  message?: string;
  gameEnded?: boolean;
  winner?: 'good' | 'evil';
  error?: string;
}
```

**Action Handlers**:

Each handler specifies:
- `id`: Action identifier
- `phases`: Valid phases for use
- `maxUses`: -1 for unlimited
- `requiresOnTeam`: Whether player must be on mission team
- `validateTargets`: Target validation function
- `execute`: Execution logic

**Testing**:
- Phase validation works
- Use limit enforcement
- Target validation (count, requirements)
- Protection blocks assassination
- Seer assassination ends game
- Rigged votes force pass
- Beeper status created correctly

---

### `StateValidator.ts`
**Purpose**: Validate game state transitions.

**Methods**:

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `validateGameStart` | gameId, hostId | ValidationResult | Check if game can start |
| `validateTeamSelection` | gameId, leaderId, teamIds | ValidationResult | Check team selection validity |
| `validateJoinGame` | gameId, userId | ValidationResult | Check if user can join |
| `getMissionSize` | playerCount, round | number | Get required team size |

**ValidationResult Interface**:
```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
}
```

**Testing**:
- Only host can start
- Player count validation (5-10)
- Team size matches requirements
- Only leader can select team
- Cannot select eliminated players

---

## Registry System

### Purpose
The registry system provides an extensible architecture for adding new characters, actions, and effects without modifying core game logic.

### `ActionRegistry.ts`
**Purpose**: Store and retrieve action definitions.

**Methods**:
- `register(action: ActionDefinition)` - Add action
- `get(actionId: string)` - Get single action
- `getAll()` - Get all actions
- `getAvailableActions(ctx, characterActions)` - Get actions available in current context
- `checkConditions(action, ctx)` - Validate action conditions
- `execute(actionId, ctx, targets)` - Execute action

---

### `EffectRegistry.ts`
**Purpose**: Store and manage passive effect definitions.

**Methods**:
- `register(effect: EffectDefinition)` - Add effect
- `get(effectId: string)` - Get single effect
- `getModifiers(effectId: string)` - Get effect's modifiers
- `triggerHooks(event, ctx, activeEffects, eventData)` - Fire event hooks

---

### `CharacterRegistry.ts`
**Purpose**: Store character definitions and resolve character-specific information.

**Methods**:
- `register(character: CharacterDefinition)` - Add character
- `get(characterId: string)` - Get single character
- `getAll()` - Get all characters
- `getByTeam(team)` - Get characters by team
- `resolveInfo(ctx)` - Get character's information with effect modifiers applied

---

### `EventBus.ts`
**Purpose**: Publish/subscribe event system for game events.

**Methods**:
- `on(event, handler)` - Subscribe to event (returns unsubscribe function)
- `emit(event, ctx, data)` - Emit event to all subscribers
- `useMiddleware(middleware)` - Add event middleware

**Events**:
- `game_start`
- `round_start`
- `round_end`
- `phase_change`
- `leader_approved`
- `leader_rejected`
- `team_selected`
- `mission_success`
- `mission_fail`
- `vote_submitted`
- `player_eliminated`
- `good_wins`
- `evil_wins`

---

## API Route Specifications

### `POST /api/games/create`
**Purpose**: Create a new game.

**Auth**: Required

**Request Body**:
```json
{
  "displayName": "string"
}
```

**Response**:
```json
{
  "game": { ... },
  "gameKey": "ABC123"
}
```

**Errors**:
- 401: Unauthorized
- 500: Creation failed

---

### `POST /api/games/:gameId/join`
**Purpose**: Join an existing game.

**Auth**: Required

**Request Body**:
```json
{
  "displayName": "string"
}
```

**Response**:
```json
{
  "player": { ... }
}
```

**Errors**:
- 400: Game full, game already started
- 401: Unauthorized
- 404: Game not found

---

### `POST /api/games/:gameId/start`
**Purpose**: Start the game (host only).

**Auth**: Required (must be host)

**Request Body**: None

**Response**:
```json
{
  "success": true
}
```

**Errors**:
- 400: Not enough players, too many players, game already started
- 401: Unauthorized
- 403: Not the host

---

### `POST /api/games/:gameId/vote`
**Purpose**: Submit a vote.

**Auth**: Required

**Request Body**:
```json
{
  "voteType": "leader" | "mission",
  "vote": "yes" | "no" | "pass" | "fail"
}
```

**Response**:
```json
{
  "success": true,
  "allVotesIn": false,
  "result": "approved",
  "tally": { "yes": 4, "no": 2 }
}
```

**Errors**:
- 400: Invalid vote, wrong phase, already voted, not on team
- 401: Unauthorized
- 403: Not in game

---

### `POST /api/games/:gameId/team`
**Purpose**: Select mission team (leader only).

**Auth**: Required (must be current leader)

**Request Body**:
```json
{
  "teamIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Response**:
```json
{
  "success": true
}
```

**Errors**:
- 400: Wrong count, invalid players, wrong phase
- 401: Unauthorized
- 403: Not the leader

---

### `POST /api/games/:gameId/action`
**Purpose**: Execute a special action.

**Auth**: Required

**Request Body**:
```json
{
  "actionId": "assassinate",
  "targetIds": ["uuid1"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Player eliminated",
  "gameEnded": false
}
```

**Errors**:
- 400: Invalid action, wrong phase, invalid targets, no uses remaining
- 401: Unauthorized
- 403: Not in game

---

## Testing Strategy

### Unit Tests

**Services**:
- `GameService`: CRUD operations, game key generation
- `VoteProcessor`: Vote tallying, phase transitions, win conditions
- `ActionProcessor`: Action validation, execution, side effects
- `StateValidator`: All validation rules

**Registries**:
- `ActionRegistry`: Registration, retrieval, condition checking
- `CharacterRegistry`: Info resolution, effect application
- `EventBus`: Subscription, emission, middleware

**Utilities**:
- `characterAssignment`: Team balance, randomization
- `gameUtils`: Key generation, link formatting

### Integration Tests

**API Routes**:
- Full game creation flow
- Player join flow
- Game start with character assignment
- Complete voting round
- Action execution with effects
- Win condition triggers

**Real-time**:
- Subscription initialization
- State sync on updates
- Multi-client synchronization

### End-to-End Tests

**Game Flows**:
- Complete good victory path
- Complete evil victory path
- Assassination phase flow
- Three-rejection auto-fail
- Special action effects

**Edge Cases**:
- Player disconnect/reconnect
- Concurrent actions
- Browser refresh mid-game

---

## Deployment Configuration

### Netlify

**`netlify.toml`**:
```toml
[build]
  command = "npm run build"
  publish = "build/client"

[functions]
  directory = "build/server"
  node_bundler = "esbuild"

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/server"
  status = 200

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Client | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase anonymous key |
| `SUPABASE_URL` | Server | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Supabase service role key |
| `VITE_CLERK_PUBLISHABLE_KEY` | Client | Clerk publishable key |
| `CLERK_SECRET_KEY` | Server | Clerk secret key |

---

## Extensibility Guide

### Adding a New Character

1. Create character definition file in `app/characters/`
2. Define: id, name, team, description, actions, effects, infoResolver
3. Create any new actions in `app/actions/`
4. Create any new effects in `app/effects/`
5. Register in `app/characters/index.ts`
6. Update team compositions if needed

### Adding a New Action

1. Create action definition file in `app/actions/`
2. Register with `ActionRegistry`
3. Add server-side handler in `ActionProcessor.registerHandler()`
4. Define: id, phases, maxUses, requiresOnTeam, validateTargets, execute

### Adding a New Effect

1. Create effect definition file in `app/effects/`
2. Register with `EffectRegistry`
3. Define: id, hooks (event handlers), modifiers (perception changes)

### Adding a New Phase

1. Add phase to `GamePhase` type
2. Create phase handler with `onEnter`, `onExit`, `canTransition`, `getNextPhase`
3. Register handler
4. Add phase component in `app/components/game/`
5. Update `GameBoard` routing

### Adding a New Win Condition

1. Create condition object with `id`, `team`, `check` function, `reason`
2. Register via `GameFlowController.registerWinCondition()`

---

## Security Considerations

1. **Server-Side Validation**: All game state changes validated on server
2. **User Authorization**: Clerk handles authentication, server validates game membership
3. **Action Authorization**: Server verifies player can perform action (correct phase, uses remaining, valid targets)
4. **Rate Limiting**: Consider Netlify function rate limits for vote submissions
5. **Data Privacy**: Character/team info only sent to relevant players via filtered queries
6. **Real-time Security**: Supabase RLS policies for table access

---

## Performance Considerations

1. **Real-time Efficiency**: Subscribe only to relevant tables/filters
2. **State Updates**: Batch related updates where possible
3. **Connection Management**: Proper cleanup of subscriptions
4. **Caching**: Static assets cached via Netlify headers
5. **Database Indexes**: Composite indexes on frequently queried columns

---

## Future Enhancements

1. **Spectator Mode**: Watch games in progress
2. **Custom Games**: Configurable character pools
3. **Game History**: Review past games
4. **Statistics**: Player win rates, character performance
5. **Chat System**: In-game communication
6. **Mobile App**: Native iOS/Android versions
7. **Additional Characters**: Expand roster with new abilities
8. **Tournament Mode**: Bracket-based competitive play
