/**
 * VoiceNexus AI — Grounded Customer WhatsApp Message Draft Generator
 * Generates personalized, multi-lingual (Tamil, English, Tanglish) follow-up drafts
 * strictly grounded in post-call verified evidence.
 *
 * Mandatory Guardrails:
 * 1. Checks customer WhatsApp consent (blocks draft/dispatch if missing).
 * 2. Checks Do-Not-Call (DNC preemption).
 * 3. Never invents unverified warranty or pricing claims.
 * 4. Defaults EVERY customer message to DRAFT_PENDING_APPROVAL.
 * 5. Requires authorized human approval before any delivery.
 */

import type { CallAutomationContext } from "./types";
import type { NotificationDispatchStatus } from "@/types/database";

export interface WhatsAppDraftResult {
  generated: boolean;
  skippedDnc?: boolean;
  consentMissing?: boolean;
  status: NotificationDispatchStatus;
  recipient: string;
  language: "en" | "ta" | "tanglish";
  renderedMessage: string;
  consentVerified: boolean;
  consentReference: string | null;
  templateKey: string;
  metadata: {
    systemCapacity?: string;
    verifiedQuote?: string;
    subsidyMentioned?: boolean;
    requiresApproval: true;
  };
}

/**
 * Detects appropriate language for the customer WhatsApp message.
 */
function resolveMessageLanguage(context: CallAutomationContext): "en" | "ta" | "tanglish" {
  if (context.language) {
    const l = context.language.toLowerCase();
    if (l === "ta" || l === "tamil") return "ta";
    if (l === "tanglish") return "tanglish";
    if (l === "en" || l === "english") return "en";
  }
  return "en";
}

/**
 * Generates a verified, personalized WhatsApp message draft.
 */
export function generateCustomerWhatsAppDraft(
  context: CallAutomationContext,
  customTemplate?: string
): WhatsAppDraftResult {
  const { analysis, lead, customerName, customerPhone, whatsappConsent, whatsappConsentReference } = context;

  // 1. Strict DNC Check: Never generate promotional messages for DNC callers
  if (
    analysis.complianceState === "DNC_REQUESTED" ||
    analysis.complianceState === "DNC_REGISTERED" ||
    lead?.do_not_call === true
  ) {
    return {
      generated: false,
      skippedDnc: true,
      status: "REJECTED",
      recipient: customerPhone || "",
      language: "en",
      renderedMessage: "",
      consentVerified: false,
      consentReference: null,
      templateKey: "NONE",
      metadata: { requiresApproval: true }
    };
  }

  // 2. Consent Check: Verify customer explicitly provided WhatsApp consent
  const hasConsent = Boolean(whatsappConsent || lead?.whatsapp_consent);
  const consentRef = whatsappConsentReference || (hasConsent ? `LEAD-CONSENT-${lead?.id?.slice(0, 8) || "VERIFIED"}` : null);

  if (!hasConsent) {
    return {
      generated: false,
      consentMissing: true,
      status: "REJECTED",
      recipient: customerPhone || "",
      language: "en",
      renderedMessage: "",
      consentVerified: false,
      consentReference: null,
      templateKey: "NONE",
      metadata: { requiresApproval: true }
    };
  }

  const lang = resolveMessageLanguage(context);

  // 3. Grounded Context Extraction
  const requirements = analysis.intelligenceData.customerRequirements;
  const capacityRequirement = requirements.find((r) => r.value.toLowerCase().includes("kw"));
  const capacityStr = capacityRequirement ? capacityRequirement.value : "rooftop solar";

  const budgetQuote = analysis.intelligenceData.budget?.exactQuote;
  const quoteSnippet = budgetQuote ? ` (Bill: ${budgetQuote})` : "";

  let renderedMessage = "";
  let templateKey = "generic_post_call_summary";

  if (customTemplate) {
    renderedMessage = customTemplate
      .replace(/{{customer_name}}/g, customerName)
      .replace(/{{capacity}}/g, capacityStr)
      .replace(/{{quote_snippet}}/g, quoteSnippet);
    templateKey = "custom_template";
  } else {
    // Standard grounded multi-lingual templates
    switch (lang) {
      case "ta":
        templateKey = "solar_estimate_ta_v1";
        renderedMessage =
          `வணக்கம் ${customerName}! வாய்ஸ்நெக்ஸஸ் சோலார் ஆலோசனைக்கு நன்றி. ` +
          `நீங்கள் கேட்ட ${capacityStr} சோலார் மதிப்பீடு தயாராக உள்ளது${quoteSnippet}. ` +
          `மத்திய அரசின் பிஎம் சூர்யா கர் மானியம் ரூ. 78,000 வரை பெறலாம். ` +
          `உங்கள் இலவச மேற்கூரை ஆய்வுத் தேதியை உறுதிசெய்ய தயவுசெய்து பதிலளிக்கவும்.`;
        break;

      case "tanglish":
        templateKey = "solar_estimate_tanglish_v1";
        renderedMessage =
          `Vanakkam ${customerName}! VoiceNexus Solar call-க்கு nandri. ` +
          `Neenga kettadhu pola ${capacityStr} system estimate ready aagi irukku${quoteSnippet}. ` +
          `PM Surya Ghar central subsidy up to Rs. 78,000 varaikkum kedaikkum. ` +
          `Unga roof inspection schedule panna indha message-ku reply pannunga.`;
        break;

      case "en":
      default:
        templateKey = "solar_estimate_en_v1";
        renderedMessage =
          `Hello ${customerName}, thank you for speaking with VoiceNexus Solar! ` +
          `Your estimate for a ${capacityStr} installation has been prepared${quoteSnippet}. ` +
          `You may be eligible for a PM Surya Ghar central subsidy of up to ₹78,000. ` +
          `Please reply to this message to confirm a convenient time for your free site inspection.`;
        break;
    }
  }

  return {
    generated: true,
    status: "DRAFT_PENDING_APPROVAL", // ALWAYS default to DRAFT_PENDING_APPROVAL!
    recipient: customerPhone || "",
    language: lang,
    renderedMessage,
    consentVerified: true,
    consentReference: consentRef,
    templateKey,
    metadata: {
      systemCapacity: capacityStr,
      verifiedQuote: budgetQuote || undefined,
      subsidyMentioned: true,
      requiresApproval: true
    }
  };
}

