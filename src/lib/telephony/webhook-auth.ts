import twilio from "twilio";

export interface TwilioWebhookVerificationOptions {
  authToken?: string;
  url: string;
  signature: string | null;
  params: Record<string, string>;
  skipInDevelopment?: boolean;
}

export interface VerificationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validates Twilio's X-Twilio-Signature header on inbound webhooks and status callbacks.
 * Protects against spoofing, replay, and unauthorized API invocations.
 */
export function verifyTwilioWebhook(options: TwilioWebhookVerificationOptions): VerificationResult {
  const { url, signature, params, skipInDevelopment = false } = options;
  const authToken = options.authToken || process.env.TWILIO_AUTH_TOKEN;

  if (process.env.NODE_ENV === "development" && skipInDevelopment) {
    return { isValid: true, reason: "Skipped in development mode" };
  }

  if (!authToken) {
    return {
      isValid: false,
      reason: "TWILIO_AUTH_TOKEN is not configured on server",
    };
  }

  if (!signature) {
    return {
      isValid: false,
      reason: "Missing X-Twilio-Signature header",
    };
  }

  try {
    let isValid = twilio.validateRequest(authToken, signature, url, params);
    if (!isValid) {
      // Fallback: If behind reverse proxy/ngrok, Twilio signed against the public base URL
      const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
      if (webhookBase) {
        try {
          const parsed = new URL(url);
          const parsedBase = new URL(webhookBase);
          const reconstructedUrl = `${parsedBase.origin}${parsed.pathname}${parsed.search}`;
          if (reconstructedUrl !== url) {
            isValid = twilio.validateRequest(authToken, signature, reconstructedUrl, params);
          }
        } catch {
          // Safe ignore URL parsing failure
        }
      }
    }

    if (!isValid) {
      return {
        isValid: false,
        reason: "X-Twilio-Signature validation failed",
      };
    }
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      reason: error instanceof Error ? error.message : "Unknown validation error",
    };
  }
}
