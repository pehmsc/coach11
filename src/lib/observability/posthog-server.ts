import { PostHog } from "posthog-node";
import {
  sanitizeProductEventProperties,
  type ProductEventName,
  type ProductEventProperties,
} from "@/lib/observability/product-events";

let posthogServerClient: PostHog | null = null;

function isPostHogEnabledOnServer() {
  return (
    process.env.NODE_ENV === "production" &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_HOST)
  );
}

function getPostHogServerClient() {
  if (!isPostHogEnabledOnServer()) return null;

  if (!posthogServerClient) {
    posthogServerClient = new PostHog(
      process.env.NEXT_PUBLIC_POSTHOG_KEY as string,
      {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        requestTimeout: 2_000,
      },
    );
  }

  return posthogServerClient;
}

export async function captureServerProductEvent(input: {
  distinctId: string;
  event: ProductEventName;
  properties: ProductEventProperties;
}) {
  const client = getPostHogServerClient();
  if (!client) return;

  client.capture({
    distinctId: input.distinctId,
    event: input.event,
    properties: sanitizeProductEventProperties(input.properties),
  });

  try {
    await client.flush();
  } catch (error) {
    console.error("[posthog.server.flush]", error);
  }
}
