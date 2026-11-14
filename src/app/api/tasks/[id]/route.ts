import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const body = await req.json();

    // 1. Fetch current task with lead DNC status
    const { data: currentTask, error: fetchErr } = await supabase
      .from("follow_up_tasks")
      .select("id, organization_id, lead_id, title, status, leads ( do_not_call )")
      .eq("id", taskId)
      .single();

    if (fetchErr || !currentTask) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    // Organization Isolation Check
    if (body.organizationId && currentTask.organization_id !== body.organizationId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Cross-organization task modification denied." },
        { status: 403 }
      );
    }

    // DNC Regulatory Enforcement: If customer is DNC and action is setting task to ACTIVE promotional callback
    const isDnc = (currentTask.leads as { do_not_call?: boolean } | null)?.do_not_call === true;
    const isEscalation = currentTask.title.toLowerCase().includes("supervisor");

    if (isDnc && !isEscalation && (body.title?.toLowerCase().includes("promotional") || currentTask.title.toLowerCase().includes("promotional"))) {
      return NextResponse.json(
        { success: false, error: "Cannot activate promotional task for customer registered on Do-Not-Call (DNC)" },
        { status: 403 }
      );
    }

    // Build update object
    const updatePayload: Database["public"]["Tables"]["follow_up_tasks"]["Update"] = {
      updated_at: new Date().toISOString()
    };

    if (body.status !== undefined) {
      updatePayload.status = body.status;
    }
    if (body.assignedTo !== undefined) {
      updatePayload.assigned_to = body.assignedTo;
    }
    if (body.dueDate !== undefined) {
      updatePayload.due_date = body.dueDate;
    }
    if (body.priority !== undefined) {
      updatePayload.priority = body.priority;
    }
    if (body.description !== undefined) {
      updatePayload.description = body.description;
    }

    const { data: updatedTask, error: updateErr } = await supabase
      .from("follow_up_tasks")
      .update(updatePayload)
      .eq("id", taskId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      task: updatedTask
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
