import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrganizationId } from "@/actions/organization";
import type { OrganizationRole } from "@/types/database";

export interface SessionContext {
  userId: string | null;
  email: string | null;
  role: OrganizationRole | null;
  organizationId: string | null;
}

/**
 * Retrieves the current session user, active organization, and role.
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
        organizationId: null,
      };
    }

    const email = user.email ?? null;

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

    return {
      userId: user.id,
      email,
      role,
      organizationId: activeOrgId,
    };
  } catch {
    return {
      userId: null,
      email: null,
      role: null,
      organizationId: null,
    };
  }
}
