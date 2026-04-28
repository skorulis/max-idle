import express from "express";
import swaggerUi from "swagger-ui-express";
import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
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
    currentSeconds: z.number().int().nonnegative(),
    idleSecondsRate: z.number().nonnegative(),
    secondsMultiplier: z.number().positive(),
    shop: z
      .object({
        seconds_multiplier: z.number().int().nonnegative(),
        restraint: z.number().int().nonnegative(),
        idle_hoarder: z.number().int().min(0).max(5).optional(),
        luck: z.number().int().nonnegative(),
        collect_gem_time_boost: z.number().int().min(0).max(5).optional(),
        worthwhile_achievements: z.number().int().min(0).max(5).optional()
      })
      .catchall(z.unknown()),
    achievementCount: z.number().int().nonnegative(),
    achievementBonusMultiplier: z.number().positive(),
    hasUnseenAchievements: z.boolean(),
    currentSecondsLastUpdated: z.string().datetime(),
    lastCollectedAt: z.string().datetime(),
    lastDailyRewardCollectedAt: z.string().datetime().nullable(),
    serverTime: z.string().datetime()
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

const achievementSchema = registry.register(
  "Achievement",
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    icon: z.string(),
    clientDriven: z.boolean(),
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
    totalCount: z.number().int().nonnegative(),
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
      idleTime: timeCurrencyBalancesSchema,
      realTime: timeCurrencyBalancesSchema,
      timeGems: timeCurrencyBalancesSchema,
      upgradesPurchased: z.number().int().nonnegative(),
      achievementCount: z.number().int().nonnegative()
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
    type: z.enum(["current", "collected"]),
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
      upgradeType: z.literal("purchase_refund")
    })
  ])
);

const shopPurchaseResponseSchema = registry.register(
  "ShopPurchaseResponse",
  playerStateSchema.extend({
    purchase: z.object({
      upgradeType: z.union([
        z.literal("seconds_multiplier"),
        z.literal("restraint"),
        z.literal("idle_hoarder"),
        z.literal("luck"),
        z.literal("extra_realtime_wait"),
        z.literal("collect_gem_time_boost"),
        z.literal("purchase_refund")
      ]),
      quantity: z.number().int().positive(),
      totalCost: z.number().int().nonnegative()
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

const tournamentCurrentResponseSchema = registry.register(
  "TournamentCurrentResponse",
  z.object({
    drawAt: z.string().datetime(),
    isActive: z.boolean(),
    hasEntered: z.boolean(),
    playerCount: z.number().int().nonnegative(),
    currentRank: z.number().int().positive().nullable(),
    expectedRewardGems: z.number().int().min(1).max(5).nullable(),
    entry: tournamentEntrySchema.nullable()
  })
);

const tournamentEnterResponseSchema = registry.register(
  "TournamentEnterResponse",
  z.object({
    tournament: tournamentCurrentResponseSchema,
    enteredNow: z.boolean()
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
    409: {
      description: "Draw is currently being finalized",
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
      type: z.enum(["current", "collected"]).optional()
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
