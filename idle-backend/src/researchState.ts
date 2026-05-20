import { parseResearchState as parseResearchStateShared, type ResearchState } from "@maxidle/shared/research";
import { getUnlockedLabCount } from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";

export function parseResearchState(raw: unknown, shop: ShopState): ResearchState {
  return parseResearchStateShared(raw, getUnlockedLabCount(shop));
}
