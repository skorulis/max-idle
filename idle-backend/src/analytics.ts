import { APP_VERSION } from "@maxidle/shared/appVersion";
import { flush, init, track } from "@amplitude/analytics-node";

const analyticsAppVersion =
  process.env.NODE_ENV === "production" ? APP_VERSION : `${APP_VERSION}_DEBUG`;

type AnalyticsIdentityContext = {
  userId: string;
  isAnonymous: boolean;
};

type AnalyticsEventPropertyValue = string | number | boolean | null;

type AnalyticsEventName =
  | "player_collect"
  | "shop_purchase"
  | "daily_reward_collect"
  | "daily_bonus_collect"
  | "obligation_reward_collect"
  | "tutorial_step_complete";

type PlayerCollectProperties = {
  collected_seconds: number;
  real_seconds_collected: number;
};

type ShopPurchaseProperties = {
  upgrade_type: string;
  quantity: number;
  total_cost: number;
};

type DailyRewardCollectProperties = {
  reward_multiplier: number;
  awarded_gems: number;
};

type DailyBonusCollectProperties = {
  bonus_type: string;
  bonus_value: number;
  awarded_seconds: number;
  activation_idle_seconds: number;
};

type ObligationRewardCollectProperties = {
  obligation_id: string;
};

type TutorialStepCompleteProperties = {
  tutorial_id: string;
};

export type AnalyticsService = {
  trackPlayerCollect(identity: AnalyticsIdentityContext, properties: PlayerCollectProperties): void;
  trackShopPurchase(identity: AnalyticsIdentityContext, properties: ShopPurchaseProperties): void;
  trackDailyRewardCollect(identity: AnalyticsIdentityContext, properties: DailyRewardCollectProperties): void;
  trackDailyBonusCollect(identity: AnalyticsIdentityContext, properties: DailyBonusCollectProperties): void;
  trackObligationRewardCollect(
    identity: AnalyticsIdentityContext,
    properties: ObligationRewardCollectProperties
  ): void;
  trackTutorialStepComplete(identity: AnalyticsIdentityContext, properties: TutorialStepCompleteProperties): void;
  shutdown(): Promise<void>;
};

export const noopAnalyticsService: AnalyticsService = {
  trackPlayerCollect(): void {},
  trackShopPurchase(): void {},
  trackDailyRewardCollect(): void {},
  trackDailyBonusCollect(): void {},
  trackObligationRewardCollect(): void {},
  trackTutorialStepComplete(): void {},
  async shutdown(): Promise<void> {}
};

function toAuthType(isAnonymous: boolean): "anonymous_token" | "session" {
  return isAnonymous ? "anonymous_token" : "session";
}

function reportTrackFailure(eventType: AnalyticsEventName, error: unknown): void {
  console.error("Amplitude track failed", { eventType, error });
}

function createBaseEventProperties(identity: AnalyticsIdentityContext): Record<string, AnalyticsEventPropertyValue> {
  return {
    auth_type: toAuthType(identity.isAnonymous)
  };
}

export function createAnalyticsService(apiKey: string): AnalyticsService {
  init(apiKey);

  const trackEvent = (
    eventType: AnalyticsEventName,
    identity: AnalyticsIdentityContext,
    properties: Record<string, AnalyticsEventPropertyValue>
  ): void => {
    void track({
      event_type: eventType,
      user_id: identity.userId,
      app_version: analyticsAppVersion,
      event_properties: {
        ...createBaseEventProperties(identity),
        ...properties
      }
    }).promise.catch((error) => {
      reportTrackFailure(eventType, error);
    });
  };

  return {
    trackPlayerCollect(identity, properties): void {
      trackEvent("player_collect", identity, properties);
    },
    trackShopPurchase(identity, properties): void {
      trackEvent("shop_purchase", identity, properties);
    },
    trackDailyRewardCollect(identity, properties): void {
      trackEvent("daily_reward_collect", identity, properties);
    },
    trackDailyBonusCollect(identity, properties): void {
      trackEvent("daily_bonus_collect", identity, properties);
    },
    trackObligationRewardCollect(identity, properties): void {
      trackEvent("obligation_reward_collect", identity, properties);
    },
    trackTutorialStepComplete(identity, properties): void {
      trackEvent("tutorial_step_complete", identity, properties);
    },
    async shutdown(): Promise<void> {
      try {
        await flush().promise;
      } catch (error) {
        console.error("Amplitude flush failed", error);
      }
    }
  };
}
