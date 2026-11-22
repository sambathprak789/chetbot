import { refundUserSlot, takeUserSlot, type SlotResult } from "../db/usage";
import { cambodiaDate } from "../utils/time";

export interface UserSlot {
  result: SlotResult;
  /** Undo the use (call when no songs could be delivered because of our side). */
  refund: () => Promise<void>;
}

/** Owner (OWNER_ID) has no daily limit and no cooldown (Spec 6.2). */
export async function useSlot(env: Env, userId: number, nowMs = Date.now()): Promise<UserSlot> {
  const today = cambodiaDate(nowMs);
  if (String(userId) === String(env.OWNER_ID)) {
    return { result: { ok: true, used: 0 }, refund: async () => {} };
  }
  const result = await takeUserSlot(env.DB, {
    userId,
    nowMs,
    today,
    limit: Number(env.DAILY_USER_LIMIT),
    cooldownMs: Number(env.COOLDOWN_SECONDS) * 1000,
  });
  return {
    result,
    refund: () => (result.ok ? refundUserSlot(env.DB, userId, today) : Promise.resolve()),
  };
}
