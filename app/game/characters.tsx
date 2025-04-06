const characters = [
    {
      alignment: "Good",
      role: "Seer",
      description: "Knows most evil players but must hide his identity.",
      sees: [
        { alignment: "Evil" },
        { role: 'Maverick' }
      ]
    },
    {
      alignment: "Good",
      role: "Protector",
      description: "Sees two candidates—one is the Seer—to protect him.",
      sees: [
        { role: "Seer" },
      ]
    },
    {
        alignment: "Good",
        role: "Inquisitor",
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
      alignment: "Good",
      role: "Support",
      description: "Regular players with no special abilities."
    },
    {
      alignment: "Evil",
      role: "Executioner",
      description: "Wins by correctly identifying the Seer after quests.",
      actions: { assassinate: true }
    },
    {
      alignment: "Evil",
      role: "Deceiver",
      description: "Appears as the Seer to confuse the Protector.",
      mimics: [
        { role: "Seer" }
      ]
    },
    {
      alignment: "Evil",
      role: "Infiltrator",
      description: "Hidden from the Seer's view.",
      mimics: [
        { alignment: "Good" }
      ]
    },
    {
      alignment: "Evil",
      role: "Maverick",
      description: "Unknown to other evil players.",
      mimics: [
        { alignment: "Good" }
      ]
    },
    {
      alignment: "Evil",
      role: "Underling",
      description: "Standard evil players without extra abilities.",
      sees: [
        { alignment: "Evil" }
      ]
    },
    {
        alignment: "Good",
        role: "Double Agent",
        description: "Appears as evil to other evil players but is actually good.",
        mimics: [
          { alignment: "Evil" }
        ]
      }
    ]

const extraCharacters = [
    // Additional Character roles
    {
      alignment: "Good",
      role: "Oracle",
      description: "Can reveal a hint about a player's alignment or role once per round.",
      action: {
        revealHint: {
          target: "any",
          effect: "If the target is Evil, returns a vague clue about their role.",
          usage: "once per round"
        }
      }
    },
    {
      alignment: "Good",
      role: "Confessor",
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
      alignment: "Evil",
      role: "Witch",
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
      alignment: "Good",
      role: "Sage",
      description: "Gains a temporary hint about a player's role each round.",
      action: {
        foresee: {
          target: "any",
          effect: "Provides a vague hint about the player's role.",
          usage: "once per round"
        }
      }
    },
    {
      alignment: "Neutral",
      role: "Renegade",
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
      alignment: "Evil",
      role: "Shadow",
      description: "Intercepts investigations, blocking a player's inquiry each round.",
      action: {
        intercept: {
          target: "any",
          effect: "Prevents the target from being investigated this round.",
          usage: "once per round"
        }
      }
    },
    // New Character roles
    {
      alignment: "Good",
      role: "Mystic",
      description: "Can sense if there's evil in a group but not who specifically.",
      action: {
        sense: {
          target: "group",
          effect: "Reveals if a quest alignment contains at least one evil player.",
          usage: "once per game"
        }
      }
    },
    {
      alignment: "Good",
      role: "Sentinel",
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
      alignment: "Good",
      role: "Historian",
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
      alignment: "Evil",
      role: "Puppetmaster",
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
      alignment: "Evil",
      role: "Mimic",
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
      alignment: "Evil",
      role: "Oracle",
      description: "Knows the identity of one special good role at the start of the game.",
      sees: [
        { alignment: "Good", only: [{ special: true }], limit: 1 }
      ]
    },
    {
      alignment: "Evil",
      role: "Saboteur",
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
      alignment: "Evil",
      role: "Anarchist",
      description: "Wins if a certain number of quests fail, regardless of which alignment ultimately wins.",
      winCondition: {
        role: "questFailures",
        count: 3
      }
    },
    {
      alignment: "Neutral",
      role: "Trickster",
      description: "Wins if they're on exactly 3 quests, regardless of success/failure.",
      winCondition: {
        role: "questParticipation",
        count: 3
      }
    },
    {
      alignment: "Neutral",
      role: "Gambler",
      description: "Must secretly bet on which alignment will win at game start. Wins only if their prediction is correct.",
      action: {
        bet: {
          target: "alignment",
          effect: "Wins if the chosen alignment wins the game.",
          usage: "once at game start"
        }
      }
    },
    {
      alignment: "Neutral",
      role: "Survivor",
      description: "Wants to avoid being accused/targeted. Wins if never formally accused throughout the game.",
      winCondition: {
        role: "avoidAccusation"
      }
    }
  ];

  