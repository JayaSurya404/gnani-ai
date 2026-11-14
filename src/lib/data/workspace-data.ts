import { createClient } from "@/lib/supabase/server";
import { SYNTHETIC_LEADS, SYNTHETIC_AGENTS, SYNTHETIC_CALLS } from "@/lib/constants";
import type { Lead, Agent, CallRecord, WorkspaceMetrics } from "@/lib/types";

export interface WorkspaceDataResult {
  leads: Lead[];
  agents: Agent[];
  calls: CallRecord[];
  isSynthetic: boolean;
  error?: string;
  unauthenticated?: boolean;
}

export async function getWorkspaceInitialData(orgId?: string | null): Promise<WorkspaceDataResult> {
  const isProduction = process.env.NODE_ENV === "production";

  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  );

  // CRITICAL REQUIREMENT: Synthetic fixtures are STRICTLY prohibited in production under ALL circumstances.
  // In development, they require explicit opting-in via NEXT_PUBLIC_ENABLE_DEMO_FIXTURES=true.
  const isDemoFixturesExplicitlyEnabled =
    !isProduction &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES === "true";

  // If Supabase is not configured:
  if (!isSupabaseConfigured) {
    if (isDemoFixturesExplicitlyEnabled) {
      return {
        leads: SYNTHETIC_LEADS,
        agents: SYNTHETIC_AGENTS,
        calls: SYNTHETIC_CALLS,
        isSynthetic: true,
      };
    }

    return {
      leads: [],
      agents: [],
      calls: [],
      isSynthetic: false,
      error: "Supabase database is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    };
  }

  try {
    const supabase = await createClient();

    // Verify session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      if (isDemoFixturesExplicitlyEnabled) {
        return {
          leads: SYNTHETIC_LEADS,
          agents: SYNTHETIC_AGENTS,
          calls: SYNTHETIC_CALLS,
          isSynthetic: true,
          unauthenticated: true,
        };
      }

      return {
        leads: [],
        agents: [],
        calls: [],
        isSynthetic: false,
        unauthenticated: true,
      };
    }

    // Target organization: passed orgId or user's first membership
    let targetOrgId = orgId;
    if (!targetOrgId) {
      const { data: member, error: memberError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (memberError) {
        return {
          leads: [],
          agents: [],
          calls: [],
          isSynthetic: false,
          error: `Failed to query organization memberships: ${memberError.message}`,
        };
      }

      if (member) {
        targetOrgId = member.organization_id;
      }
    }

    if (!targetOrgId) {
      // User has no organizations yet
      return {
        leads: [],
        agents: [],
        calls: [],
        isSynthetic: false,
      };
    }

    // Fetch leads
    const { data: dbLeads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .eq("organization_id", targetOrgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (leadsError) {
      return {
        leads: [],
        agents: [],
        calls: [],
        isSynthetic: false,
        error: `Database query error on leads: ${leadsError.message}`,
      };
    }

    // Fetch agents
    const { data: dbAgents, error: agentsError } = await supabase
      .from("voice_agents")
      .select("*, agent_versions(*)")
      .eq("organization_id", targetOrgId)
      .order("created_at", { ascending: false });

    if (agentsError) {
      return {
        leads: [],
        agents: [],
        calls: [],
        isSynthetic: false,
        error: `Database query error on agents: ${agentsError.message}`,
      };
    }

    // Fetch calls
    const { data: dbCalls, error: callsError } = await supabase
      .from("call_sessions")
      .select("*, call_outcomes(*)")
      .eq("organization_id", targetOrgId)
      .order("created_at", { ascending: false });

    if (callsError) {
      return {
        leads: [],
        agents: [],
        calls: [],
        isSynthetic: false,
        error: `Database query error on calls: ${callsError.message}`,
      };
    }

    // Map genuine database records
    const leads: Lead[] = (dbLeads || []).map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email ?? undefined,
      temperature: l.temperature,
      status: l.status,
      score: l.score,
      source: l.source,
      primaryInterest: l.primary_interest ?? "General Inquiry",
      location: l.location ?? undefined,
      lastActivityAt: new Date(l.last_activity_at).toLocaleDateString(),
      summary: l.summary ?? undefined,
    }));

    const agents: Agent[] = (dbAgents || []).map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role_title,
      languageMode: a.language_mode,
      voiceId: a.voice_id,
      voiceName: a.voice_name,
      activeVersion: "v1.0",
      status: (a.status as "ACTIVE" | "DRAFT" | "PAUSED") || "ACTIVE",
      callCount: 0,
      avgDurationSec: 0,
      updatedAt: new Date(a.updated_at).toLocaleDateString(),
    }));

    const calls: CallRecord[] = (dbCalls || []).map((c) => {
      const outcome = Array.isArray(c.call_outcomes)
        ? c.call_outcomes[0]
        : c.call_outcomes;
      return {
        id: c.id,
        leadId: c.lead_id ?? "unknown",
        leadName: c.customer_name ?? "Prospective Lead",
        leadPhone: c.customer_phone ?? "--",
        agentId: c.agent_id ?? "agent-1",
        agentName: "Voice Agent",
        status: c.status,
        durationSeconds: c.duration_seconds,
        disposition: outcome?.disposition ?? undefined,
        sentiment: outcome?.sentiment ?? undefined,
        confidence: outcome?.confidence_score ?? undefined,
        createdAt: new Date(c.created_at).toLocaleDateString(),
        summary: outcome?.summary ?? undefined,
      };
    });

    return {
      leads,
      agents,
      calls,
      isSynthetic: false,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[WorkspaceData] Unexpected error executing queries:", errorMsg);

    // CRITICAL: Do NOT hide failed production queries with synthetic fixtures!
    return {
      leads: [],
      agents: [],
      calls: [],
      isSynthetic: false,
      error: `Database connection error: ${errorMsg}`,
    };
  }
}

export function computeWorkspaceMetrics(leads: Lead[], calls: CallRecord[]): WorkspaceMetrics {
  const hotLeads = leads.filter((l) => l.temperature === "HOT").length;
  const qualifiedLeads = leads.filter((l) => l.status === "QUALIFIED").length;
  const totalCalls = calls.length;
  const avgDuration =
    totalCalls > 0
      ? Math.round(calls.reduce((acc, c) => acc + c.durationSeconds, 0) / totalCalls)
      : 0;

  return {
    totalLeads: leads.length,
    hotLeads,
    totalCalls,
    avgCallDurationSec: avgDuration,
    conversionRate: leads.length > 0 ? Number(((qualifiedLeads / leads.length) * 100).toFixed(1)) : 0,
    qualifiedRate: totalCalls > 0 ? Number(((qualifiedLeads / totalCalls) * 100).toFixed(1)) : 0,
  };
}
