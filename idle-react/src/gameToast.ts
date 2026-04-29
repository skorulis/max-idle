import { toast } from "sonner";
import { formatSeconds } from "./formatSeconds";

export function toastCollectIdle(collectedSeconds: number, realSecondsCollected: number) {
  const idle = formatSeconds(collectedSeconds);
  const real = formatSeconds(realSecondsCollected);
  toast.success(`Collected ${idle} idle time · ${real} real time`);
}

export { toast };
