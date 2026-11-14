import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const requestedLanguage = body?.language || "ta-IN";
    const customInstructions = body?.customInstructions || "";

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    // 1. Fetch Lead with Full Context
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (leadErr || !lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    // 2. Fetch Business Profile
    let businessName = "Kaveri Solar & Construction";
    let businessCity = "Coimbatore";
    if (lead.business_id) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("name, city, phone")
        .eq("id", lead.business_id)
        .maybeSingle();
      if (biz?.name) businessName = biz.name;
      if (biz?.city) businessCity = biz.city;
    }

    // 3. Fetch Historical Call Attempts & Outcomes for this Lead
    const { data: pastCalls } = await supabase
      .from("call_sessions")
      .select("id, status, duration_seconds, created_at, call_outcomes(disposition, summary, sentiment)")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(3);

    const callHistorySummary = pastCalls && pastCalls.length > 0
      ? pastCalls
          .map((c) => {
            const outcome = Array.isArray(c.call_outcomes) ? c.call_outcomes[0] : c.call_outcomes;
            return `Call on ${new Date(c.created_at).toLocaleDateString()}: status=${c.status}, disposition=${outcome?.disposition || "NONE"}`;
          })
          .join("; ")
      : "No previous phone attempts";

    // 4. Fetch Previous Lead Events (calculator, form submission, notes)
    const { data: events } = await supabase
      .from("lead_events")
      .select("event_type, title, description, metadata, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(5);

    let calculatorInteraction = "";
    if (events) {
      for (const ev of events) {
        const meta = ev.metadata as Record<string, unknown> | null;
        if (meta?.monthlyBill || meta?.systemSize) {
          calculatorInteraction = `Monthly bill: ₹${meta.monthlyBill || "N/A"}, System size: ${meta.systemSize || "N/A"}`;
          break;
        }
      }
    }

    const customerName = (lead.name || "Customer").replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim() || "Customer";
    const primaryInterest = lead.primary_interest || "Solar Consultation";
    const isTamil = requestedLanguage.startsWith("ta");
    const cleanNotes = (lead.notes || "")
      .replace(/\[TEST_CONTACT\]\s*/gi, "")
      .replace(/TEST_CONTACT\s*/gi, "")
      .replace(/SAMPLE_LEAD\s*/gi, "")
      .trim();

    // 5. Generate Grounded, Personalized Conversation Plan
    const plan = {
      leadId: id,
      customerName,
      customerPhone: lead.phone,
      primaryInterest,
      businessName,
      objective: `Qualify ${customerName}'s requirements for ${primaryInterest}, confirm feasibility in ${lead.location || businessCity}, and schedule a technical consultation.`,
      openingGreeting: isTamil
        ? `வணக்கம் ${customerName}! நான் ${businessName} நிறுவனத்திலிருந்து பேசுகிறேன். நீங்கள் ${primaryInterest} குறித்து வினவியிருந்தீர்கள். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?`
        : `Hello ${customerName}! I am calling from ${businessName}. You recently enquired about ${primaryInterest}. May I have two minutes to discuss your clean energy requirements?`,
      customerContext: `Customer: ${customerName} (${lead.phone}). Location: ${lead.location || businessCity}. Requirement: ${primaryInterest}.${cleanNotes ? ` Context: ${cleanNotes}.` : ""} ${calculatorInteraction ? `${calculatorInteraction}. ` : ""}Prior History: ${callHistorySummary}.${customInstructions ? ` Owner instructions: ${customInstructions}` : ""}`,
      conversationStrategy: `1. Verify genuine customer intent and confirm whether agricultural, residential, or commercial application. 2. Address subsidy eligibility (such as PM-KUSUM Component-B or PM Surya Ghar). 3. Propose free site engineering survey.`,
      discoveryQuestions: [
        "What is your average monthly electricity bill or sanctioned load?",
        "Do you have a shadow-free RCC concrete roof or industrial metal sheet available?",
        "Are you interested in direct PM Surya Ghar subsidy assistance (up to ₹78,000 for residential)?",
        "Would you prefer an engineer site visit this weekend or a preliminary quotation via WhatsApp first?",
      ],
      anticipatedObjections: [
        {
          objection: "How much government subsidy will I receive?",
          response: "Under PM Surya Ghar Muft Bijli Yojana, residential systems receive ₹30,000 for 1kW, ₹60,000 for 2kW, and ₹78,000 for 3kW or higher, credited directly to your bank account post-commissioning.",
        },
        {
          objection: "Does the system work during power cuts or monsoon overcast days?",
          response: "Our Tier-1 bifacial panels generate 25-40% even under diffuse cloud cover. For power backup, we offer hybrid solar inverters with lithium battery integration.",
        },
        {
          objection: "Is there any EMI financing available?",
          response: "Yes, we partner with leading public and private banks offering 0% processing fee solar loans with EMIs starting under ₹2,500/month, offset by your bill savings.",
        },
      ],
      escalationTrigger: "If the customer requests utility-scale financing (>100kW), structural rooftop modification, or expresses dissatisfaction, initiate immediate human escalation or promise a senior engineer callback within 30 minutes.",
      suggestedNextAction: "Book on-site shadow analysis and deliver formal system sizing proposal.",
      recommendedLanguage: isTamil ? "ta-IN" : "en-IN",
      recommendedVoice: isTamil ? "Asmita" : "Arun",
    };

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { objective, openingGreeting, customNotes } = body;

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (objective) updatePayload.summary = String(objective);
    if (customNotes) updatePayload.notes = String(customNotes);

    const { error } = await supabase.from("leads").update(updatePayload as never).eq("id", id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Call plan customizations saved successfully.",
      openingGreeting,
      objective,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
