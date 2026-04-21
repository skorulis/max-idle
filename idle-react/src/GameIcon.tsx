import type { LucideIcon, LucideProps } from "lucide-react";

type GameIconProps = Omit<LucideProps, "size" | "strokeWidth"> & {
  icon: LucideIcon;
  size?: number;
  strokeWidth?: number;
};

const DEFAULT_ICON_SIZE = 18;
const DEFAULT_ICON_STROKE_WIDTH = 2.5;

function GameIcon({
  icon: Icon,
  className,
  size = DEFAULT_ICON_SIZE,
  strokeWidth = DEFAULT_ICON_STROKE_WIDTH,
  ...props
}: GameIconProps) {
  const combinedClassName = className ? `game-icon ${className}` : "game-icon";

  return <Icon aria-hidden="true" className={combinedClassName} size={size} strokeWidth={strokeWidth} {...props} />;
}

export default GameIcon;
