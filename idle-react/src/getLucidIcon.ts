import {
  Atom,
  Archive, 
  BadgeCheck,
  CalendarX,
  CircleHelp,
  Clock3,
  Construction,
  Dice5,
  Gem,
  Gift,
  Gauge,
  Layers,
  Hourglass,
  Leaf,
  Medal,
  Repeat,
  Sparkles,
  ShieldAlert,
  Timer,
  Trophy,
  Undo2,
  UserPlus,
  type LucideIcon
} from "lucide-react";

export function getLucidIcon(iconName: string): LucideIcon {
  switch (iconName) {
    case "atom":
      return Atom;
    case "construction":
      return Construction;
    case "user-plus":
      return UserPlus;
    case "badge-check":
      return BadgeCheck;
    case "clock":
      return Clock3;
    case "repeat":
      return Repeat;
    case "sparkles":
      return Sparkles;
    case "gauge":
      return Gauge;
    case "shield-alert":
      return ShieldAlert;
    case "dice-5":
      return Dice5;
    case "gem":
      return Gem;
    case "gift":
      return Gift;
    case "hourglass":
      return Hourglass;
    case "layers":
      return Layers;
    case "leaf":
      return Leaf;
    case "medal":
      return Medal;
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
