"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrganizationRole } from "@/types/database";

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: OrganizationRole;
}

export async function getUserOrganizations(): Promise<UserOrganization[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data, error } = await db
    .from("organization_members")
    .select(`
      organization_id,
      role,
      organizations:organization_id (
        id,
        name,
        slug,
        plan
      )
    `)
    .eq("user_id", user.id);

  if (error || !data) return [];

  return data
    .filter((m) => m.organizations !== null)
    .map((m) => {
      const org = m.organizations as unknown as {
        id: string;
        name: string;
        slug: string;
        plan: string;
      };
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        role: m.role as OrganizationRole,
      };
    });
}

export async function getActiveOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  const savedOrgId = cookieStore.get("voicenexus_active_org")?.value;

  const orgs = await getUserOrganizations();
  if (orgs.length === 0) {
    if (savedOrgId) {
      try {
        cookieStore.delete("voicenexus_active_org");
      } catch {}
    }
    return null;
  }

  // If savedOrgId is valid and user is actually a member, use it
  if (savedOrgId && orgs.some((o) => o.id === savedOrgId)) {
    return savedOrgId;
  }

  // Otherwise fallback to user's first valid organization and sanitize cookie
  const firstOrgId = orgs[0].id;
  try {
    cookieStore.set("voicenexus_active_org", firstOrgId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // In server components set may fail silently; ignored
  }
  return firstOrgId;
}

export async function switchOrganizationAction(orgId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify server-side that user is actually a member of this organization
  const admin = createAdminClient();
  const db = admin ?? supabase;
  const { data, error } = await db
    .from("organization_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "You are not a member of this organization." };
  }

  const cookieStore = await cookies();
  cookieStore.set("voicenexus_active_org", orgId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function createOrganizationAction(formData: FormData): Promise<{ success: boolean; error?: string; orgId?: string }> {
  const name = (formData.get("name") as string)?.trim();

  if (!name || name.length < 2) {
    return { success: false, error: "Organization name must be at least 2 characters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    Math.random().toString(36).substring(2, 6);

  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({
      name,
      slug,
      plan: "GROWTH",
    })
    .select("id")
    .single();

  if (orgError || !org) {
    return { success: false, error: orgError?.message || "Failed to create organization." };
  }

  // Add current user as OWNER
  const { error: memberError } = await db.from("organization_members").insert({
    organization_id: org.id,
    user_id: user.id,
    role: "OWNER",
  });

  if (memberError) {
    return { success: false, error: memberError.message };
  }

  // Create default business
  await db.from("businesses").insert({
    organization_id: org.id,
    name,
    country: "India",
  });

  // Switch to new org
  const cookieStore = await cookies();
  cookieStore.set("voicenexus_active_org", org.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
  return { success: true, orgId: org.id };
}

