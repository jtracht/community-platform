import { createHmac } from "node:crypto";
import { transaction, query } from "../../../packages/database/index.js";
export async function sharedLimit(
  key: string,
  maximum: number,
  seconds: number,
) {
  const bucket = createHmac("sha256", process.env.SESSION_SECRET!)
    .update("limit:" + key + ":" + Math.floor(Date.now() / (seconds * 1000)))
    .digest("hex");
  return transaction(async (c) => {
    await c.execute(
      "INSERT INTO rate_windows(bucket_hash,requests,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE requests=requests+1",
      [bucket, new Date(Date.now() + seconds * 2000)],
    );
    const used = (
      await query<{ requests: number }>(
        c,
        "SELECT requests FROM rate_windows WHERE bucket_hash=? FOR UPDATE",
        [bucket],
      )
    )[0]!.requests;
    return Number(used) <= maximum;
  });
}
