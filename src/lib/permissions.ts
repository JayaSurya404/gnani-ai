import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrganizationId } from "@/actions/organization";
import type { OrganizationRole } from "@/types/database";

/**
 * Masks a phone number for evaluator or preview sessions.
 * Preserves the country code prefix (+91 etc.) while masking middle digits,
 * showing only the final 4 digits.
 * e.g. "+91 6382868845" -> "+91 ******8845"
 * e.g. "+919840123456" -> "+91 ******3456"
 * e.g. "9840123456" -> "******3456"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone || typeof phone !== "string") return "";
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return "****";

  let countryCode = "";
  let digits = cleaned.replace(/[\s-]/g, "");

  if (digits.startsWith("+91")) {
    countryCode = "+91 ";
    digits = digits.slice(3);
  } else if (digits.startsWith("+")) {
    const match = digits.match(/^(\+\d{1,3})(.*)$/);
    if (match) {
      countryCode = match[1] + " ";
      digits = match[2];
    }
  }

  if (digits.length <= 4) {
    return `${countryCode}****`;
  }

  const last4 = digits.slice(-4);
  return `${countryCode}******${last4}`;
}

/**
 * Masks an email address for evaluator or preview sessions.
 * e.g. "lakshmi.narayanan@example.com" -> "l***@***.com"
 * e.g. "admin@kaverisolar.in" -> "a***@***.in"
 */
export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== "string") return "";
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0) return "****";

  const firstChar = trimmed[0];
  const domainPart = trimmed.slice(atIndex + 1);
  const dotIndex = domainPart.lastIndexOf(".");
  const tld = dotIndex !== -1 ? domainPart.slice(dotIndex) : ".com";

  return `${firstChar}***@***${tld}`;
}

/**
 * Checks if a given email is the designated evaluator or demo preview account.
 */
export function isEvaluatorEmail(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const configured = (process.env.DEMO_EVALUATOR_EMAIL || "preview@voicenexus.ai").toLowerCase();
  return normalized === "preview@voicenexus.ai" || normalized === configured;
}

export interface SessionContext {
  userId: string | null;
  email: string | null;
  role: OrganizationRole | null;
  isEvaluator: boolean;
  organizationId: string | null;
}

/**
 * Retrieves the current session user, active organization, role, and evaluator status.
 * Evaluator status is true if the authenticated user's email matches the preview account
 * or if the user holds an AGENT (read-only) membership role.
 */
export async function getSessionContext(): Promise<SessionContext> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        userId: null,
        email: null,
        role: null,
        isEvaluator: false,
        organizationId: null,
      };
    }

    const email = user.email ?? null;
    const isEvalEmail = isEvaluatorEmail(email);

    let activeOrgId: string | null = null;
    try {
      activeOrgId = await getActiveOrganizationId();
    } catch {
      // In standalone or isolated requests, getActiveOrganizationId may fail
    }

    const admin = createAdminClient();
    const db = admin ?? supabase;

    let role: OrganizationRole | null = null;
    if (activeOrgId) {
      const { data: member } = await db
        .from("organization_members")
        .select("role")
        .eq("organization_id", activeOrgId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (member) {
        role = member.role as OrganizationRole;
      }
    } else {
      // Fallback: check any membership for user
      const { data: firstMember } = await db
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (firstMember) {
        activeOrgId = firstMember.organization_id;
        role = firstMember.role as OrganizationRole;
      }
    }

    // An evaluator session is either the designated preview email or role AGENT
    const isEvaluator = isEvalEmail || role === "AGENT";

    return {
      userId: user.id,
      email,
      role,
      isEvaluator,
      organizationId: activeOrgId,
    };
  } catch {
    return {
      userId: null,
      email: null,
      role: null,
      isEvaluator: false,
      organizationId: null,
    };
  }
}
