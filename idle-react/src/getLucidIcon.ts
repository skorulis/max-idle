import {
  Archive,
  BadgeCheck,
  CalendarX,
  CircleHelp,
  Clock3,
  Dice5,
  Gauge,
  Hourglass,
  Repeat,
  ShieldAlert,
  Timer,
  Trophy,
  Undo2,
  UserPlus,
  type LucideIcon
} from "lucide-react";

export function getLucidIcon(iconName: string): LucideIcon {
  switch (iconName) {
    case "user-plus":
      return UserPlus;
    case "badge-check":
      return BadgeCheck;
    case "clock":
      return Clock3;
    case "repeat":
      return Repeat;
    case "gauge":
      return Gauge;
    case "shield-alert":
      return ShieldAlert;
    case "dice-5":
      return Dice5;
    case "hourglass":
      return Hourglass;
    case "calendar-x":
      return CalendarX;
    case "archive":
      return Archive;
    case "timer":
      return Timer;
    case "undo-2":
      return Undo2;
    case "trophy":
      return Trophy;
    default:
      return CircleHelp;
  }
}
