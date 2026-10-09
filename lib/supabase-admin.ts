import "server-only"; // importing this from a client component fails the build
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { readServiceRoleEnv } from "./env-guard";
import { readPublicConfig, serverClientOptions } from "./supabase";

/**
 * PRIVILEGED ACCESS — server only.
 *
 * SUPABASE_SERVICE_ROLE_KEY bypasses Row Level Security, so:
 *   - it lives only in .env.local / the hosting provider's secret settings,
 *     WITHOUT the NEXT_PUBLIC_ prefix (next.config.ts refuses to build otherwise);
 *   - this is the only file that reads it (enforced by tests/security-static.test.ts);
 *   - it does NOT export a general-purpose client. It exposes exactly one
 *     operation: calling create_order() for guest checkout. Everything else
 *     in the app uses the public key or the signed-in user's token.
 */

export class ServiceRoleNotConfiguredError extends Error {
  constructor(reason = "SUPABASE_SERVICE_ROLE_KEY is not set; guest checkout is disabled.") {
    super(reason);
    this.name = "ServiceRoleNotConfiguredError";
  }
}

export interface CreateOrderArgs {
  p_customer: Record<string, string | null>;
  p_items: { product_id: number; quantity: number }[];
  p_idempotency_key: string;
}

export async function createOrderAsServer(
  args: CreateOrderArgs,
): Promise<{ data: unknown; error: PostgrestError | null }> {
  const { url } = readPublicConfig(); // also re-checks that no secret is public
  const service = readServiceRoleEnv(process.env);
  if (!service.ok) throw new ServiceRoleNotConfiguredError(service.problem);

  const admin = createClient(url, service.key, serverClientOptions);
  const { data, error } = await admin.rpc("create_order", args);
  return { data, error };
}
