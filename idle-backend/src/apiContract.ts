import express from "express";
import swaggerUi from "swagger-ui-express";
import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE } from "@maxidle/shared/shopUpgrades";
import { z } from "zod";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const errorResponseSchema = registry.register(
  "ErrorResponse",
  z.object({
    error: z.string(),
    code: z.string().optional()
  })
);

const authResponseSchema = registry.register(
  "AuthResponse",
  z.object({
    userId: z.string().uuid(),
    token: z.string()
  })
);

const timeCurrencyBalancesSchema = registry.register(
  "TimeCurrencyBalances",
  z.object({
    total: z.number().int().nonnegative(),
    available: z.number().int().nonnegative()
  })
);

const playerStateSchema = registry.register(
  "PlayerState",
  z.object({
    idleTime: timeCurrencyBalancesSchema,
    realTime: timeCurrencyBalancesSchema,
    timeGems: timeCurrencyBalancesSchema,
    upgradesPurchased: z.number().int().nonnegative(),
    level: z.number().int().positive(),
    currentSeconds: z.number().int().nonnegative(),
    idleSecondsRate: z.number().nonnegative(),
    secondsMultiplier: z.number().positive(),
    shop: z
      .object({
        seconds_multiplier: z.number().int().nonnegative(),
        another_seconds_multiplier: z.number().int().nonnegative().optional(),
        restraint: z.number().int().nonnegative(),
        idle_hoarder: z.number().int().min(0).max(5).optional(),
        luck: z.number().int().nonnegative(),
        collect_gem_time_boost: z.number().int().min(0).max(5).optional(),
        worthwhile_achievements: z
          .number()
          .int()
          .min(0)
          .max(WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE.maxLevel())
          .optional()
      })
      .catchall(z.unknown()),
    achievementCount: z.number().int().nonnegative(),
    achievementBonusMultiplier: z.number().positive(),
    hasUnseenAchievements: z.boolean(),
    currentSecondsLastUpdated: z.string().datetime(),
    lastCollectedAt: z.string().datetime(),
    lastDailyRewardCollectedAt: z.string().datetime().nullable(),
    dailyBonus: z
      .object({
        type: z.enum([
          "collect_idle_percent",
          "collect_real_percent",
          "double_gems_daily_reward",
          "free_time_gem",
          "free_real_time_hours",
          "free_idle_time_hours"
        ]),
        value: z.number().int().positive(),
        date: z.string().datetime(),
        isCollectable: z.boolean(),
        isClaimed: z.boolean(),
        activationCostIdleSeconds: z.number().int().positive()
      })
      .nullable(),
    serverTime: z.string().datetime(),
    tutorialProgress: z.string(),
    obligationsCompleted: z.record(z.string(), z.boolean()),
    collectionCount: z.number().int().nonnegative()
  })
);

const tutorialCompleteRequestSchema = registry.register(
  "TutorialCompleteRequest",
  z.object({
    tutorialId: z.string().min(1)
  })
);

const accountResponseSchema = registry.register(
  "AccountResponse",
  z.object({
    isAnonymous: z.boolean(),
    email: z.string().email().nullable(),
    username: z.string().nullable(),
    gameUserId: z.string().uuid().nullable(),
    canUpgrade: z.boolean().optional(),
    socialProviders: z.object({
      googleEnabled: z.boolean(),
      appleEnabled: z.boolean()
    })
  })
);

const achievementLevelSchema = z.object({
  value: z.number(),
  name: z.string().optional()
});

const achievementSchema = registry.register(
  "Achievement",
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    icon: z.string(),
    clientDriven: z.boolean(),
    levelValueDisplay: z.literal("time_seconds").optional(),
    levels: z.array(achievementLevelSchema).optional(),
    level: z.number().int().nonnegative(),
    maxLevel: z.number().int().positive(),
    completed: z.boolean(),
    grantedAt: z.string().datetime().nullable()
  })
);

const grantAchievementRequestSchema = registry.register(
  "GrantAchievementRequest",
  z.object({
    achievementId: z.string()
  })
);

const achievementsResponseSchema = registry.register(
  "AchievementsResponse",
  z.object({
    completedCount: z.number().int().nonnegative(),
    earningsBonusMultiplier: z.number().positive(),
    achievements: z.array(achievementSchema)
  })
);

const playerProfileResponseSchema = registry.register(
  "PlayerProfileResponse",
  z.object({
    player: z.object({
      id: z.string().uuid(),
      username: z.string(),
      accountAgeSeconds: z.number().int().nonnegative(),
      currentIdleSeconds: z.number().int().nonnegative(),
      timeAwaySeconds: z.number().int().nonnegative(),
      idleTime: timeCurrencyBalancesSchema,
      realTime: timeCurrencyBalancesSchema,
      timeGems: timeCurrencyBalancesSchema,
      upgradesPurchased: z.number().int().nonnegative(),
      achievementCount: z.number().int().nonnegative(),
      level: z.number().int().positive()
    }),
    meta: z.object({
      serverTime: z.string().datetime()
    })
  })
);

const leaderboardEntrySchema = registry.register(
  "LeaderboardEntry",
  z.object({
    rank: z.number().int().positive(),
    userId: z.string().uuid(),
    username: z.string(),
    totalIdleSeconds: z.number().int().nonnegative(),
    isCurrentPlayer: z.boolean()
  })
);

const leaderboardResponseSchema = registry.register(
  "LeaderboardResponse",
  z.object({
    type: z.enum(["current", "collected", "time_gems"]),
    entries: z.array(leaderboardEntrySchema),
    currentPlayer: z
      .object({
        userId: z.string().uuid(),
        rank: z.number().int().positive(),
        totalIdleSeconds: z.number().int().nonnegative(),
        inTop: z.boolean()
      })
      .nullable()
  })
);

const shopPurchaseRequestSchema = registry.register(
  "ShopPurchaseRequest",
  z.discriminatedUnion("upgradeType", [
    z.object({
      upgradeType: z.literal("seconds_multiplier"),
      quantity: z.union([z.literal(1), z.literal(5), z.literal(10)])
    }),
    z.object({
      upgradeType: z.literal("another_seconds_multiplier")
    }),
    z.object({
      upgradeType: z.literal("restraint")
    }),
    z.object({
      upgradeType: z.literal("idle_hoarder")
    }),
    z.object({
      upgradeType: z.literal("luck")
    }),
    z.object({
      upgradeType: z.literal("extra_realtime_wait")
    }),
    z.object({
      upgradeType: z.literal("collect_gem_time_boost")
    }),
    z.object({
      upgradeType: z.literal("idle_refund")
    }),
    z.object({
      upgradeType: z.literal("real_refund")
    })
  ])
);

const shopPurchaseResponseSchema = registry.register(
  "ShopPurchaseResponse",
  playerStateSchema.extend({
    purchase: z.object({
      upgradeType: z.union([
        z.literal("seconds_multiplier"),
        z.literal("another_seconds_multiplier"),
        z.literal("restraint"),
        z.literal("idle_hoarder"),
        z.literal("luck"),
        z.literal("extra_realtime_wait"),
        z.literal("collect_gem_time_boost"),
        z.literal("idle_refund"),
        z.literal("real_refund")
      ]),
      quantity: z.number().int().positive(),
      totalCost: z.number().int().nonnegative()
    })
  })
);

const shopUpgradeLevelResponseSchema = registry.register(
  "ShopUpgradeLevelResponse",
  playerStateSchema.extend({
    levelUpgrade: z.object({
      previousLevel: z.number().int().positive(),
      newLevel: z.number().int().positive(),
      idleSecondsCost: z.number().int().nonnegative(),
      realSecondsCost: z.number().int().nonnegative()
    })
  })
);

const playerCollectResponseSchema = registry.register(
  "PlayerCollectResponse",
  playerStateSchema.extend({
    collectedSeconds: z.number().int().nonnegative(),
    realSecondsCollected: z.number().int().nonnegative()
  })
);

const dailyBonusHistoryItemSchema = registry.register(
  "DailyBonusHistoryItem",
  z.object({
    type: z.enum([
      "collect_idle_percent",
      "collect_real_percent",
      "double_gems_daily_reward",
      "free_time_gem",
      "free_real_time_hours",
      "free_idle_time_hours"
    ]),
    value: z.number().int().positive(),
    date: z.string().datetime()
  })
);

const dailyBonusHistoryResponseSchema = registry.register(
  "DailyBonusHistoryResponse",
  z.object({
    history: z.array(dailyBonusHistoryItemSchema)
  })
);

const collectionHistoryItemSchema = registry.register(
  "CollectionHistoryItem",
  z.object({
    id: z.number().int().nonnegative(),
    collectionDate: z.string().datetime(),
    realTime: z.number().int().nonnegative(),
    idleTime: z.number().int().nonnegative()
  })
);

const collectionHistoryResponseSchema = registry.register(
  "CollectionHistoryResponse",
  z.object({
    history: z.array(collectionHistoryItemSchema)
  })
);

const tournamentEntrySchema = registry.register(
  "TournamentEntry",
  z.object({
    enteredAt: z.string().datetime(),
    finalRank: z.number().int().positive().nullable(),
    timeScoreSeconds: z.number().int().nonnegative().nullable(),
    gemsAwarded: z.number().int().min(1).max(5).nullable(),
    finalizedAt: z.string().datetime().nullable()
  })
);

const tournamentRankedEntrySchema = registry.register(
  "TournamentRankedEntry",
  z.object({
    rank: z.number().int().positive(),
    userId: z.string().uuid(),
    username: z.string(),
    timeScoreSeconds: z.number().int().nonnegative(),
    isCurrentPlayer: z.boolean()
  })
);

const tournamentOutstandingResultSchema = registry.register(
  "TournamentOutstandingResult",
  z.object({
    tournamentId: z.number().int().positive(),
    drawAt: z.string().datetime(),
    finalizedAt: z.string().datetime(),
    finalRank: z.number().int().positive(),
    gemsAwarded: z.number().int().min(1).max(5),
    playerCount: z.number().int().nonnegative()
  })
);

const tournamentHistoryItemSchema = registry.register(
  "TournamentHistoryItem",
  z.object({
    drawAt: z.string().datetime(),
    finalRank: z.number().int().positive(),
    playerCount: z.number().int().positive(),
    gemsAwarded: z.number().int().min(0).max(5).nullable()
  })
);

const tournamentHistoryResponseSchema = registry.register(
  "TournamentHistoryResponse",
  z.object({
    history: z.array(tournamentHistoryItemSchema)
  })
);

const tournamentCurrentResponseSchema = registry.register(
  "TournamentCurrentResponse",
  z.object({
    drawAt: z.string().datetime(),
    isActive: z.boolean(),
    hasEntered: z.boolean(),
    playerCount: z.number().int().nonnegative(),
    currentRank: z.number().int().positive().nullable(),
    expectedRewardGems: z.number().int().min(1).max(5).nullable(),
    nearbyEntries: z.array(tournamentRankedEntrySchema),
    entry: tournamentEntrySchema.nullable(),
    outstanding_result: tournamentOutstandingResultSchema.nullable()
  })
);

const tournamentCollectRewardResponseSchema = registry.register(
  "TournamentCollectRewardResponse",
  z.object({
    gemsCollected: z.number().int().min(1).max(5)
  })
);

const tournamentEnterResponseSchema = registry.register(
  "TournamentEnterResponse",
  z.object({
    tournament: tournamentCurrentResponseSchema,
    enteredNow: z.boolean()
  })
);

const surveyOptionSchema = registry.register(
  "SurveyOption",
  z.object({
    id: z.string(),
    text: z.string()
  })
);

const surveySchema = registry.register(
  "Survey",
  z.object({
    id: z.string(),
    active: z.boolean(),
    currencyType: z.enum(["idle", "real", "gem"]),
    reward: z.number().int().positive(),
    title: z.string(),
    options: z.array(surveyOptionSchema)
  })
);

const surveyAvailableSummarySchema = registry.register(
  "SurveyAvailableSummary",
  z.object({
    id: z.string(),
    title: z.string(),
    currencyType: z.enum(["idle", "real", "gem"]),
    reward: z.number().int().positive()
  })
);

const surveyActiveResponseSchema = registry.register(
  "SurveyActiveResponse",
  z.object({
    survey: surveySchema.nullable()
  })
);

const surveyAnswerRequestSchema = registry.register(
  "SurveyAnswerRequest",
  z.object({
    surveyId: z.string().min(1),
    optionId: z.string().min(1)
  })
);

const homeResponseSchema = registry.register(
  "HomeResponse",
  z.object({
    player: playerStateSchema,
    account: accountResponseSchema,
    tournament: tournamentCurrentResponseSchema.nullable(),
    availableSurvey: surveyAvailableSummarySchema.nullable()
  })
);

const emailAuthRequestSchema = registry.register(
  "EmailAuthRequest",
  z.object({
    email: z.string().email(),
    password: z.string().min(1),
    name: z.string().optional()
  })
);

const betterAuthPassthroughSchema = registry.register("BetterAuthPassthrough", z.record(z.string(), z.unknown()));

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT"
});

registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token"
});

const authViaCookieOrBearer: Array<Record<string, string[]>> = [{ cookieAuth: [] }, { bearerAuth: [] }];

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Service healthcheck",
  responses: {
    200: {
      description: "Health response",
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true) })
        }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/auth/anonymous",
  tags: ["Auth"],
  summary: "Create an anonymous account",
  responses: {
    201: {
      description: "Anonymous credentials",
      content: {
        "application/json": { schema: authResponseSchema }
      }
    },
    500: {
      description: "Server error",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/player/daily-bonus/collect",
  tags: ["Player"],
  summary: "Activate today's daily bonus (costs idle time; grants time rewards when applicable)",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Updated player state after bonus claim",
      content: {
        "application/json": { schema: playerStateSchema }
      }
    },
    400: {
      description: "Daily bonus cannot be claimed",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Register with email and password",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: emailAuthRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Better Auth response payload",
      content: {
        "application/json": { schema: betterAuthPassthroughSchema }
      }
    },
    400: {
      description: "Invalid registration payload",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Login with email and password",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: emailAuthRequestSchema.omit({ name: true })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Better Auth response payload",
      content: {
        "application/json": { schema: betterAuthPassthroughSchema }
      }
    },
    400: {
      description: "Invalid login payload",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Logout current session",
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "Better Auth response payload",
      content: {
        "application/json": { schema: betterAuthPassthroughSchema }
      }
    },
    204: {
      description: "Logged out successfully"
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/account",
  tags: ["Account"],
  summary: "Get current account details",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Account details",
      content: {
        "application/json": { schema: accountResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/account/upgrade",
  tags: ["Account"],
  summary: "Upgrade anonymous account to registered account",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: emailAuthRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Better Auth response payload",
      content: {
        "application/json": { schema: betterAuthPassthroughSchema }
      }
    },
    400: {
      description: "Cannot upgrade request",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/account/username",
  tags: ["Account"],
  summary: "Set account username",
  security: authViaCookieOrBearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            username: z.string().min(3).max(32)
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Updated username",
      content: {
        "application/json": {
          schema: z.object({ username: z.string() })
        }
      }
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    409: {
      description: "Username already taken",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/player",
  tags: ["Player"],
  summary: "Get current player state",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Current player state",
      content: {
        "application/json": { schema: playerStateSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/player/tutorial/complete",
  tags: ["Player"],
  summary: "Record a completed tutorial step and return updated player state",
  security: authViaCookieOrBearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: tutorialCompleteRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: playerStateSchema }
      }
    },
    400: {
      description: "Invalid tutorial id or body",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/player/tutorial/reset",
  tags: ["Player"],
  summary: "Clear tutorial progress so the intro can be shown again",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: playerStateSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/home",
  tags: ["Player"],
  summary: "Player, account, and current tournament in one response",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description:
        "Aggregated home payload. When tournament is present, nearbyEntries is always an empty array (use GET /tournament/current for nearby ranks or top players when not entered).",
      content: {
        "application/json": { schema: homeResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/surveys/active",
  tags: ["Surveys"],
  summary: "Get the first active survey the player has not completed",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Active survey or null if none",
      content: {
        "application/json": { schema: surveyActiveResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/surveys/answer",
  tags: ["Surveys"],
  summary: "Submit a survey answer and receive the configured reward",
  security: authViaCookieOrBearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: surveyAnswerRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Updated player state after reward",
      content: {
        "application/json": { schema: playerStateSchema }
      }
    },
    400: {
      description: "Invalid payload or option",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    404: {
      description: "Player not found or survey not found/inactive",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    409: {
      description: "Survey already answered (code SURVEY_ALREADY_ANSWERED)",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/player/collect",
  tags: ["Player"],
  summary: "Collect accumulated idle time",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Collected player state",
      content: {
        "application/json": { schema: playerCollectResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/player/daily-bonus/history",
  tags: ["Player"],
  summary: "Get latest global daily bonus history",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Latest daily bonus history items",
      content: {
        "application/json": { schema: dailyBonusHistoryResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/player/collection-history",
  tags: ["Player"],
  summary: "Get the player's most recent collection history (up to 100 rows)",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Latest collection history items",
      content: {
        "application/json": { schema: collectionHistoryResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/player/daily-reward/collect",
  tags: ["Player"],
  summary: "Collect daily reward",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Updated player state after reward",
      content: {
        "application/json": { schema: playerStateSchema }
      }
    },
    400: {
      description: "Reward unavailable",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/tournament/current",
  tags: ["Tournament"],
  summary: "Get the current weekly tournament",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Current tournament details for the user",
      content: {
        "application/json": { schema: tournamentCurrentResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    403: {
      description: "Weekly tournament shop upgrade required",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/tournament/history",
  tags: ["Tournament"],
  summary: "Get the player's last 50 finalized tournament results",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Tournament history rows from tournament_entries",
      content: {
        "application/json": { schema: tournamentHistoryResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    403: {
      description: "Weekly tournament shop upgrade required",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/tournament/enter",
  tags: ["Tournament"],
  summary: "Enter the current weekly tournament",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Tournament entry result",
      content: {
        "application/json": { schema: tournamentEnterResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    403: {
      description: "Weekly tournament shop upgrade required",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    409: {
      description:
        "Conflict: tournament draw is being finalized (code TOURNAMENT_DRAW_IN_PROGRESS), or a prior reward must be collected first (code TOURNAMENT_REWARD_UNCOLLECTED).",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/tournament/collect-reward",
  tags: ["Tournament"],
  summary: "Collect Time Gems from the oldest finalized tournament reward",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Reward credited to the player",
      content: {
        "application/json": { schema: tournamentCollectRewardResponseSchema }
      }
    },
    400: {
      description: "No uncollected tournament reward (code NO_TOURNAMENT_REWARD_TO_COLLECT)",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    403: {
      description: "Weekly tournament shop upgrade required",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/players/{id}",
  tags: ["Player"],
  summary: "Get public player profile",
  request: {
    params: z.object({
      id: z.string().uuid()
    })
  },
  responses: {
    200: {
      description: "Player profile",
      content: {
        "application/json": { schema: playerProfileResponseSchema }
      }
    },
    400: {
      description: "Invalid player id",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/achievements",
  tags: ["Achievements"],
  summary: "List achievements and completion state",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Achievements",
      content: {
        "application/json": { schema: achievementsResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/achievements/seen",
  tags: ["Achievements"],
  summary: "Mark unseen achievements as seen",
  security: authViaCookieOrBearer,
  responses: {
    204: {
      description: "Marked as seen"
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/achievements/grant",
  tags: ["Achievements"],
  summary: "Grant a client-driven achievement",
  security: authViaCookieOrBearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: grantAchievementRequestSchema }
      }
    }
  },
  responses: {
    204: {
      description: "Achievement granted"
    },
    400: {
      description: "Invalid achievement payload",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "get",
  path: "/leaderboard",
  tags: ["Leaderboard"],
  summary: "Get leaderboard data",
  request: {
    query: z.object({
      type: z.enum(["current", "collected", "time_gems"]).optional()
    })
  },
  responses: {
    200: {
      description: "Leaderboard",
      content: {
        "application/json": { schema: leaderboardResponseSchema }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/shop/purchase",
  tags: ["Shop"],
  summary: "Purchase seconds multiplier upgrade",
  security: authViaCookieOrBearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: shopPurchaseRequestSchema }
      }
    }
  },
  responses: {
    200: {
      description: "Updated player state after purchase",
      content: {
        "application/json": { schema: shopPurchaseResponseSchema }
      }
    },
    400: {
      description: "Invalid request or insufficient funds",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

registry.registerPath({
  method: "post",
  path: "/shop/upgradeLevel",
  tags: ["Shop"],
  summary: "Spend idle and real time to increase player level by one",
  security: authViaCookieOrBearer,
  responses: {
    200: {
      description: "Updated player state after level upgrade",
      content: {
        "application/json": { schema: shopUpgradeLevelResponseSchema }
      }
    },
    400: {
      description: "Insufficient funds or player already at max level",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorResponseSchema }
      }
    }
  }
});

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Max Idle API",
      version: "1.0.0",
      description: "Generated API contract for Max Idle backend."
    }
  });
}

export function registerApiDocumentation(app: express.Express): void {
  const document = buildOpenApiDocument();
  app.get("/openapi.json", (_req, res) => {
    res.json(document);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(document));
}
