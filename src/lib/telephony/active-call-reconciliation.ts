import type { SupabaseClient } from "@supabase/supabase-js";
import type twilio from "twilio";

export interface ActiveCallCheckResult {
  hasGenuinelyActiveCall: boolean;
  blockingCallSessionId?: string;
  twilioCallSid?: string;
  status?: string;
  reason?: string;
}

/**
 * Inspects in-flight call sessions for a recipient and reconciles stale or completed sessions
 * against the carrier (Twilio REST API) or timeouts before deciding whether to block.
 */
export async function checkAndReconcileActiveCalls(
  supabase: SupabaseClient,
  twilioClient: twilio.Twilio | null,
  organizationId: string,
  phoneVariants: string[]
): Promise<ActiveCallCheckResult> {
  // 1. Query for candidate in-flight call sessions for this recipient across all phone variants
  const { data: candidates, error } = await supabase
    .from("call_sessions")
    .select("id, status, recording_url, created_at, start_time")
    .eq("organization_id", organizationId)
    .in("customer_phone", phoneVariants)
    .in("status", ["INITIATING", "RINGING", "IN_PROGRESS"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ActiveCallReconciliation] Query error:", error);
    // If DB query fails, fail safe and allow call (do not block on transient DB error)
    return { hasGenuinelyActiveCall: false };
  }

  if (!candidates || candidates.length === 0) {
    return { hasGenuinelyActiveCall: false };
  }

  for (const candidate of candidates) {
    // Extract Twilio Call SID if present (stored as "twilio:CA..." in recording_url)
    const twSidMatch = candidate.recording_url?.match(/CA[a-zA-Z0-9]{32}/i);
    const twSid = twSidMatch ? twSidMatch[0] : null;

    if (twSid && twilioClient) {
      try {
        const twCall = await twilioClient.calls(twSid).fetch();
        const twStatus = (twCall.status || "").toLowerCase();

        // Terminal statuses in Twilio: completed, canceled, busy, no-answer, failed
        if (["completed", "canceled", "busy", "no-answer", "failed"].includes(twStatus)) {
          let mappedStatus = "COMPLETED";
          if (twStatus === "failed") mappedStatus = "FAILED";
          else if (twStatus === "canceled") mappedStatus = "CANCELED";
          else if (twStatus === "busy") mappedStatus = "BUSY";
          else if (twStatus === "no-answer") mappedStatus = "NO_ANSWER";

          const duration = parseInt(twCall.duration || "0", 10);
          await supabase
            .from("call_sessions")
            .update({
              status: mappedStatus,
              duration_seconds: duration,
              end_time: twCall.endTime ? new Date(twCall.endTime).toISOString() : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", candidate.id);

          console.log(`[ActiveCallReconciliation] Reconciled stale session ${candidate.id} (Twilio SID ${twSid}: ${twStatus} -> ${mappedStatus})`);
          continue; // Reconciled! Not active. Check next candidate.
        } else {
          // Carrier status is queued, ringing, in-progress: Genuinely active!
          return {
            hasGenuinelyActiveCall: true,
            blockingCallSessionId: candidate.id,
            twilioCallSid: twSid,
            status: candidate.status,
            reason: `Genuinely active call on carrier network (Twilio SID ${twSid} status: ${twCall.status}).`,
          };
        }
      } catch (fetchErr: unknown) {
        const err = fetchErr as { status?: number; code?: number; message?: string };
        // If 404 (Resource not found on Twilio), mark failed
        if (err.status === 404 || err.code === 20404) {
          await supabase
            .from("call_sessions")
            .update({
              status: "FAILED",
              end_time: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", candidate.id);
          continue;
        }
        console.warn(`[ActiveCallReconciliation] Could not fetch Twilio call ${twSid}:`, err.message);
      }
    }

    // If no Twilio SID or Twilio fetch failed: check session age
    const createdAtMs = new Date(candidate.created_at || candidate.start_time || Date.now()).getTime();
    const ageSeconds = Math.max(0, (Date.now() - createdAtMs) / 1000);

    // Stale threshold: if in INITIATING/RINGING for > 45 seconds without resolution, reconcile as FAILED
    if (ageSeconds > 45) {
      await supabase
        .from("call_sessions")
        .update({
          status: "FAILED",
          end_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id);

      console.log(`[ActiveCallReconciliation] Timed out stale session ${candidate.id} (age: ${Math.round(ageSeconds)}s -> FAILED)`);
      continue;
    }

    // Very fresh candidate (< 45s) currently in progress: Genuinely active!
    return {
      hasGenuinelyActiveCall: true,
      blockingCallSessionId: candidate.id,
      twilioCallSid: twSid || undefined,
      status: candidate.status,
      reason: `An outbound call request was dispatched ${Math.round(ageSeconds)}s ago and is in progress.`,
    };
  }

  return { hasGenuinelyActiveCall: false };
}

/**
 * Sweeps all in-flight call sessions for an organization and reconciles them
 * against live carrier status (Twilio REST API) or timeouts.
 */
export async function reconcileOrganizationInFlightCalls(
  supabase: SupabaseClient,
  twilioClient: twilio.Twilio | null,
  organizationId: string
): Promise<number> {
  if (!twilioClient) return 0;

  const { data: inFlight, error } = await supabase
    .from("call_sessions")
    .select("id, status, recording_url, created_at, start_time")
    .eq("organization_id", organizationId)
    .in("status", ["INITIATING", "RINGING", "IN_PROGRESS"]);

  if (error || !inFlight || inFlight.length === 0) return 0;

  let reconciledCount = 0;
  for (const session of inFlight) {
    const twSidMatch = session.recording_url?.match(/CA[a-zA-Z0-9]{32}/i);
    const twSid = twSidMatch ? twSidMatch[0] : null;

    if (twSid) {
      try {
        const twCall = await twilioClient.calls(twSid).fetch();
        const twStatus = (twCall.status || "").toLowerCase();

        if (["completed", "canceled", "busy", "no-answer", "failed"].includes(twStatus)) {
          let mappedStatus = "COMPLETED";
          if (twStatus === "failed") mappedStatus = "FAILED";
          else if (twStatus === "canceled") mappedStatus = "CANCELED";
          else if (twStatus === "busy") mappedStatus = "BUSY";
          else if (twStatus === "no-answer") mappedStatus = "NO_ANSWER";

          const duration = parseInt(twCall.duration || "0", 10);
          await supabase
            .from("call_sessions")
            .update({
              status: mappedStatus,
              duration_seconds: duration,
              end_time: twCall.endTime ? new Date(twCall.endTime).toISOString() : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);

          console.log(`[ActiveCallReconciliation] Reconciled session ${session.id} (Twilio ${twSid}: ${twStatus} -> ${mappedStatus})`);
          reconciledCount++;
        }
      } catch (err: unknown) {
        const e = err as { status?: number; code?: number };
        if (e.status === 404 || e.code === 20404) {
          await supabase
            .from("call_sessions")
            .update({
              status: "FAILED",
              end_time: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);
          reconciledCount++;
        }
      }
    } else {
      const createdAtMs = new Date(session.created_at || session.start_time || Date.now()).getTime();
      const age = (Date.now() - createdAtMs) / 1000;
      if (age > 45) {
        await supabase
          .from("call_sessions")
          .update({
            status: "FAILED",
            end_time: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id);
        reconciledCount++;
      }
    }
  }

  return reconciledCount;
}
