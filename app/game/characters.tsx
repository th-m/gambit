const characters = [
    {
      team: "Good",
      type: "Seer",
      description: "Knows most evil players but must hide his identity.",
      sees: [
        { team: "Evil" },
        { type: 'Maverick' }
      ]
    },
    {
      team: "Good",
      type: "Protector",
      description: "Sees two candidates—one is the Seer—to protect him.",
      sees: [
        { type: "Seer" },
      ]
    },
    {
        team: "Good",
        type: "Inquisitor",
        description: "Can force one player to publicly reveal their vote on a quest.",
        action: {
          reveal: {
            target: "any",
            effect: "Forces target to publicly show their vote before results are shown.",
            usage: "once per game"
          }
        }
      },
    {
      team: "Good",
      type: "Support",
      description: "Regular players with no special abilities."
    },
    {
      team: "Evil",
      type: "Executioner",
      description: "Wins by correctly identifying the Seer after quests.",
      actions: { assassinate: true }
    },
    {
      team: "Evil",
      type: "Deceiver",
      description: "Appears as the Seer to confuse the Protector.",
      mimics: [
        { type: "Seer" }
      ]
    },
    {
      team: "Evil",
      type: "Infiltrator",
      description: "Hidden from the Seer's view.",
      mimics: [
        { team: "Good" }
      ]
    },
    {
      team: "Evil",
      type: "Maverick",
      description: "Unknown to other evil players.",
      mimics: [
        { team: "Good" }
      ]
    },
    {
      team: "Evil",
      type: "Underling",
      description: "Standard evil players without extra abilities.",
      sees: [
        { team: "Evil" }
      ]
    },
    {
        team: "Good",
        type: "Double Agent",
        description: "Appears as evil to other evil players but is actually good.",
        mimics: [
          { team: "Evil" }
        ]
      }
    ]
    
const extraCharacters = [
    // Additional Character Types
    {
      team: "Good",
      type: "Oracle",
      description: "Can reveal a hint about a player's alignment or type once per round.",
      action: {
        revealHint: {
          target: "any",
          effect: "If the target is Evil, returns a vague clue about their type.",
          usage: "once per round"
        }
      }
    },
    {
      team: "Good",
      type: "Confessor",
      description: "Can secretly query a player's alignment once per game.",
      action: {
        query: {
          target: "any",
          effect: "Reveals the target's alignment.",
          usage: "once per game"
        }
      }
    },
    {
      team: "Evil",
      type: "Witch",
      description: "Can curse a player, nullifying their action for a round.",
      action: {
        curse: {
          target: "any",
          effect: "Negates the target's action for the current round.",
          usage: "once per game"
        }
      }
    },
    {
      team: "Good",
      type: "Sage",
      description: "Gains a temporary hint about a player's type each round.",
      action: {
        foresee: {
          target: "any",
          effect: "Provides a vague hint about the player's type.",
          usage: "once per round"
        }
      }
    },
    {
      team: "Neutral",
      type: "Renegade",
      description: "Aims to be the last player standing; wins if the game ends in a tie.",
      action: {
        lastStand: {
          target: "self",
          effect: "Boosts survival chance in tie games.",
          usage: "passive"
        }
      }
    },
    {
      team: "Evil",
      type: "Shadow",
      description: "Intercepts investigations, blocking a player's inquiry each round.",
      action: {
        intercept: {
          target: "any",
          effect: "Prevents the target from being investigated this round.",
          usage: "once per round"
        }
      }
    },
    // New Character Types
    {
      team: "Good",
      type: "Mystic",
      description: "Can sense if there's evil in a group but not who specifically.",
      action: {
        sense: {
          target: "group",
          effect: "Reveals if a quest team contains at least one evil player.",
          usage: "once per game"
        }
      }
    },
    {
      team: "Good",
      type: "Sentinel",
      description: "Can protect one quest from failure, overriding any sabotage attempts.",
      action: {
        protect: {
          target: "quest",
          effect: "Prevents a quest from failing regardless of votes.",
          usage: "once per game"
        }
      }
    },

    {
      team: "Good",
      type: "Historian",
      description: "Knows the results of one future quest in advance.",
      action: {
        foresight: {
          target: "quest",
          effect: "Learns the outcome of a quest before it happens.",
          usage: "once per game"
        }
      }
    },
    {
      team: "Evil",
      type: "Puppetmaster",
      description: "Can force another player to vote a certain way once per game.",
      action: {
        manipulate: {
          target: "any",
          effect: "Forces target to vote as the Puppetmaster chooses.",
          usage: "once per game"
        }
      }
    },
    {
      team: "Evil",
      type: "Mimic",
      description: "Can copy another player's ability once per game.",
      action: {
        copy: {
          target: "any",
          effect: "Copies and uses the target's special ability.",
          usage: "once per game"
        }
      }
    },
    {
      team: "Evil",
      type: "Oracle",
      description: "Knows the identity of one special good role at the start of the game.",
      sees: [
        { team: "Good", only: [{ special: true }], limit: 1 }
      ]
    },
    {
      team: "Evil",
      type: "Saboteur",
      description: "Can make a successful quest appear to have failed (or vice versa) once per game.",
      action: {
        sabotage: {
          target: "quest",
          effect: "Reverses the apparent outcome of a quest.",
          usage: "once per game"
        }
      }
    },
    {
      team: "Evil",
      type: "Anarchist",
      description: "Wins if a certain number of quests fail, regardless of which team ultimately wins.",
      winCondition: {
        type: "questFailures",
        count: 3
      }
    },
    {
      team: "Neutral",
      type: "Trickster",
      description: "Wins if they're on exactly 3 quests, regardless of success/failure.",
      winCondition: {
        type: "questParticipation",
        count: 3
      }
    },
    {
      team: "Neutral",
      type: "Gambler",
      description: "Must secretly bet on which team will win at game start. Wins only if their prediction is correct.",
      action: {
        bet: {
          target: "team",
          effect: "Wins if the chosen team wins the game.",
          usage: "once at game start"
        }
      }
    },
    {
      team: "Neutral",
      type: "Survivor",
      description: "Wants to avoid being accused/targeted. Wins if never formally accused throughout the game.",
      winCondition: {
        type: "avoidAccusation"
      }
    }
  ];

  