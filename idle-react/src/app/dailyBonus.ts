import type { DailyBonus, DailyBonusHistoryItem } from "./types";

export function getDailyBonusDescription(dailyBonus: DailyBonus | DailyBonusHistoryItem | null): string {
  if (!dailyBonus) {
    return "Loading daily bonus...";
  }
  switch (dailyBonus.type) {
    case "collect_idle_percent":
      return `+${dailyBonus.value}% idle time on collect`;
    case "collect_real_percent":
      return `+${dailyBonus.value}% real time on collect`;
    case "double_gems_daily_reward":
      return "Double gems from daily reward collection";
    case "free_real_time_hours":
      return `Collect ${dailyBonus.value}h free real time`;
    case "free_idle_time_hours":
      return `Collect ${dailyBonus.value}h free idle time`;
  }
}

export function isDoubleGemsDailyReward(dailyBonus: DailyBonus | DailyBonusHistoryItem | null): boolean {
  return dailyBonus?.type === "double_gems_daily_reward";
}

export function formatDailyBonusDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric"
  });
}
