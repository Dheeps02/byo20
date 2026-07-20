import { NotImplementedError } from "../../errors";
/** World clock tick stub — advances in-game time and fires agenda events. */
import type { WorldClockTickResult } from "../../interfaces/rules-engine";

/**
 * Advance the campaign world clock by `minutes` in-game minutes.
 * Polls the agenda ZSET for events that fire during the elapsed window.
 */
export async function tickWorldClock(campaignId: string, minutes: number): Promise<WorldClockTickResult> {
    throw new NotImplementedError("tickWorldClock");
}
