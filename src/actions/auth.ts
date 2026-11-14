"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuthActionResult {
  success?: boolean;
  error?: string;
  message?: string;
}

export async function signInAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const returnUrl = (formData.get("returnUrl") as string) || "/dashboard";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Look up organizations for user to set default active org
  if (data.user) {
    const admin = createAdminClient();
    const db = admin ?? supabase;
    const { data: memberships } = await db
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", data.user.id)
      .limit(1);

    const cookieStore = await cookies();
    if (memberships && memberships.length > 0) {
      cookieStore.set("voicenexus_active_org", memberships[0].organization_id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    } else {
      try {
        cookieStore.delete("voicenexus_active_org");
      } catch {}
    }
  }

  redirect(returnUrl);
}

export async function signUpAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const orgName = (formData.get("organizationName") as string)?.trim();

  if (!fullName || !email || !password || !orgName) {
    return { error: "All fields are required to register your organization." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters long." };
  }

  const supabase = await createClient();

  // 1. Sign up user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        organization_name: orgName,
      },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  const user = authData.user;
  if (!user) {
    return {
      message:
        "Registration received. Please check your email inbox to confirm your account.",
      success: true,
    };
  }

  // If email confirmation is enabled, Supabase returns user with no active session
  if (!authData.session) {
    return {
      success: true,
      message:
        "Registration successful! A verification link has been sent to " +
        email +
        ". Please verify your email before logging in to your new workspace.",
    };
  }

  // 2. Email confirmation is disabled (or session is immediately active)
  // Ensure profile exists
  await supabase.from("profiles").upsert({
    id: user.id,
    full_name: fullName,
    platform_role: "USER",
  });

  // Check if organization was already provisioned by trigger
  const { data: existingMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let targetOrgId = existingMember?.organization_id;

  // Fallback: If trigger did not run, provision organization manually
  if (!targetOrgId) {
    const orgSlug =
      orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      Math.random().toString(36).substring(2, 6);

    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: orgName,
        slug: orgSlug,
        plan: "STARTER",
      })
      .select("id")
      .single();

    if (orgData) {
      targetOrgId = orgData.id;
      await supabase.from("organization_members").insert({
        organization_id: orgData.id,
        user_id: user.id,
        role: "OWNER",
      });

      await supabase.from("businesses").insert({
        organization_id: orgData.id,
        name: orgName,
        country: "India",
      });
    } else if (orgError) {
      console.warn("[SignUp] Manual org creation fallback warning:", orgError.message);
    }
  }

  if (targetOrgId) {
    const cookieStore = await cookies();
    cookieStore.set("voicenexus_active_org", targetOrgId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete("voicenexus_active_org");

  redirect("/login");
}

export async function resetPasswordAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get("email") as string)?.trim();

  if (!email) {
    return { error: "Please enter your registered email address." };
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/callback?next=/settings`,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: "Password reset link has been dispatched to your email address.",
  };
}

