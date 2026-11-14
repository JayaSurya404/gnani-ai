import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { INDUSTRY_TEMPLATES } from "../src/lib/agent-templates";
import { GNANI_VOICE_CATALOG } from "../src/lib/voice-profiles";
import { validatePrompt, resolvePromptVariables } from "../src/lib/prompt-builder";
import { processVoiceTurn } from "../src/lib/voice-agent-runtime";

function parseEnv(content: string) {
  const res: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      res[key] = val;
    }
  }
  return res;
}

const env = parseEnv(fs.readFileSync(".env.local", "utf8"));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("======================================================================");
  console.log("  VoiceNexus AI — Phase 5 AI Agent Studio & Versioning E2E Suite");
  console.log("  Target Host:", new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname);
  console.log("======================================================================\n");

  let testOrgId: string;

  // 1. Resolve Organization
  const { data: orgs } = await sb.from("organizations").select("id").limit(1);
  if (!orgs || orgs.length === 0) {
    const { data: newOrg } = await sb
      .from("organizations")
      .insert({ name: "Studio Verification Org", slug: `studio-org-${Date.now()}` })
      .select("id")
      .single();
    testOrgId = newOrg!.id;
  } else {
    testOrgId = orgs[0].id;
  }
  console.log("[PASS] 1. Organization confirmed:", testOrgId);

  // 2. Select Industry Template
  const solarTpl = INDUSTRY_TEMPLATES.find((t) => t.industryKey === "SOLAR");
  if (!solarTpl) throw new Error("Solar template not found in registry");
  console.log("[PASS] 2. Industry template selected:", solarTpl.title);

  // 3. Create AI Agent
  const { data: agent, error: aErr } = await sb
    .from("voice_agents")
    .insert({
      organization_id: testOrgId,
      name: "Selvi E2E Verification",
      role_title: solarTpl.roleTitle,
      language_mode: solarTpl.recommendedLanguage,
      voice_id: solarTpl.recommendedVoiceId,
      voice_name: solarTpl.recommendedVoiceName,
      status: "ACTIVE",
    } as never)
    .select("id, name, status")
    .single();

  if (aErr || !agent) throw new Error(`Agent creation failed: ${aErr?.message}`);
  const agentId = agent.id;
  console.log(`[PASS] 3. AI Agent provisioned: ID=${agentId}, Name=${agent.name}, Status=${agent.status}`);

  // 4. Configure Voice Profile with Consent Validation
  const voice = GNANI_VOICE_CATALOG.find((v) => v.id === solarTpl.recommendedVoiceId);
  if (!voice || voice.consent.status !== "VERIFIED") {
    throw new Error("Voice consent verification failed");
  }
  console.log(`[PASS] 4. Voice profile verified with consent: ${voice.name} (${voice.consent.consentRef})`);

  // 5. Create and Validate System Prompt
  const initialPrompt = solarTpl.systemPromptTemplate;
  const validation1 = validatePrompt(initialPrompt);
  if (!validation1.isValid) {
    throw new Error(`Prompt validation failed: ${validation1.errors.join("; ")}`);
  }
  console.log(`[PASS] 5. System prompt validated: ${validation1.wordCount} words, ${validation1.detectedVariables.length} tokens`);

  // 6. Save and Publish Version 1 (v1.0)
  const { data: v1, error: v1Err } = await sb
    .from("agent_versions")
    .insert({
      agent_id: agentId,
      version_number: "v1.0",
      system_prompt: initialPrompt,
      greeting_message: "Vanakkam! I am Selvi, an AI consultant calling from Aadhira Solar Tech.",
      turn_timeout_ms: 2500,
      max_duration_seconds: 600,
      notes: "Initial v1.0 baseline",
    } as never)
    .select("id, version_number")
    .single();

  if (v1Err || !v1) throw new Error(`v1.0 creation failed: ${v1Err?.message}`);
  const v1Id = v1.id;

  // Set active_version_id to v1
  await sb.from("voice_agents").update({ active_version_id: v1Id }).eq("id", agentId);
  console.log(`[PASS] 6. Version 1 published: ID=${v1Id}, Version=${v1.version_number}`);

  // 7. Modify Prompt with Additional Objection Handling
  const modifiedPrompt = `${initialPrompt}\n\nSPECIAL DIRECTIVE: For industrial consumers with sanction load >100kW, highlight open access captive solar regulations.`;
  const validation2 = validatePrompt(modifiedPrompt);
  if (!validation2.isValid) throw new Error("Modified prompt validation failed");
  console.log("[PASS] 7. System prompt modified with additional compliance directives.");

  // 8. Save and Publish Version 2 (v1.1)
  const { data: v2, error: v2Err } = await sb
    .from("agent_versions")
    .insert({
      agent_id: agentId,
      version_number: "v1.1",
      system_prompt: modifiedPrompt,
      greeting_message: "Vanakkam sir! Selvi here from Aadhira Solar Tech.",
      turn_timeout_ms: 2000,
      max_duration_seconds: 600,
      notes: "v1.1 industrial open access update",
    } as never)
    .select("id, version_number")
    .single();

  if (v2Err || !v2) throw new Error(`v1.1 creation failed: ${v2Err?.message}`);
  const v2Id = v2.id;

  // Update active_version_id to v2
  await sb.from("voice_agents").update({ active_version_id: v2Id }).eq("id", agentId);
  console.log(`[PASS] 8. Version 2 published: ID=${v2Id}, Version=${v2.version_number}`);

  // 9. Compare Versions (Diff Verification)
  const { data: allVersions } = await sb
    .from("agent_versions")
    .select("id, version_number, system_prompt, turn_timeout_ms")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true });

  if (!allVersions || allVersions.length !== 2) {
    throw new Error(`Expected exactly 2 version snapshots, found ${allVersions?.length}`);
  }
  const isDifferent = allVersions[0].system_prompt !== allVersions[1].system_prompt;
  if (!isDifferent) throw new Error("Version comparison failed: contents are identical!");
  console.log(`[PASS] 9. Version diff verified: ${allVersions[0].version_number} vs ${allVersions[1].version_number} (Timeout: ${allVersions[0].turn_timeout_ms}ms vs ${allVersions[1].turn_timeout_ms}ms)`);

  // 10. Rollback to Version 1 (v1.0)
  await sb.from("voice_agents").update({ active_version_id: v1Id }).eq("id", agentId);
  const { data: rolledBackAgent } = await sb
    .from("voice_agents")
    .select("id, active_version_id")
    .eq("id", agentId)
    .single();

  if (rolledBackAgent?.active_version_id !== v1Id) {
    throw new Error("Rollback failed: active_version_id was not reverted!");
  }
  console.log(`[PASS] 10. Rollback verified: Agent active_version_id reverted to v1.0 (${v1Id})`);

  // 11. Associate Agent with a LeadNexus Lead
  const { data: testLead, error: lErr } = await sb
    .from("leads")
    .insert({
      organization_id: testOrgId,
      name: "Ramesh Narayanan",
      phone: "+919840188888",
      primary_interest: "50kW Industrial Rooftop",
      source: "Playground Test Lead",
      score: 90,
      temperature: "HOT",
      status: "NEW",
    } as never)
    .select("id, name, primary_interest")
    .single();

  if (lErr || !testLead) throw new Error(`Lead creation failed: ${lErr?.message}`);
  const testLeadId = testLead.id;

  const resolvedPrompt = resolvePromptVariables(initialPrompt, {
    customerName: testLead.name,
    customerInterest: testLead.primary_interest,
    businessName: "Aadhira Solar Tech",
    city: "Chennai",
    agentName: "Selvi",
  });

  if (!resolvedPrompt.includes("Ramesh Narayanan") || !resolvedPrompt.includes("50kW Industrial Rooftop")) {
    throw new Error("Variable resolution failed: Lead details missing from prompt!");
  }
  console.log(`[PASS] 11. LeadNexus lead associated: ${testLead.name} (${testLead.primary_interest})`);

  // 12. Test Prompt in Runtime Playground
  const turnResult = processVoiceTurn({
    agentName: "Selvi",
    businessName: "Aadhira Solar Tech",
    systemPrompt: resolvedPrompt,
    languageMode: "AUTO",
    userMessage: "What is the PM Surya Ghar subsidy for residential solar?",
    history: [],
    leadContext: {
      name: testLead.name,
      primaryInterest: testLead.primary_interest,
    },
  });

  if (!turnResult.text.includes("78,000") || turnResult.sentiment !== "POSITIVE") {
    throw new Error(`Playground turn failed: unexpected reply "${turnResult.text}"`);
  }
  console.log(`[PASS] 12. Playground turn executed: Latency=${turnResult.turnLatencyMs}ms, Sentiment=${turnResult.sentiment}`);

  // Test DNC enforcement turn
  const dncTurn = processVoiceTurn({
    agentName: "Selvi",
    businessName: "Aadhira Solar Tech",
    systemPrompt: resolvedPrompt,
    languageMode: "AUTO",
    userMessage: "I am not interested, please do not call me again.",
    history: [],
  });

  if (!dncTurn.doNotCall || dncTurn.action !== "END_REQUESTED") {
    throw new Error("DNC opt-out enforcement failed!");
  }
  console.log("[PASS] 13. Safety guardrail verified: Do-Not-Call (DNC) opt-out enforced.");

  // Cleanup fixtures
  await sb.from("leads").delete().eq("id", testLeadId);
  await sb.from("agent_versions").delete().eq("agent_id", agentId);
  await sb.from("voice_agents").delete().eq("id", agentId);
  console.log("[PASS] 14. Test fixtures cleaned up from database.");

  console.log("\n======================================================================");
  console.log("  ALL PHASE 5 AI AGENT STUDIO & VERSIONING TESTS PASSED!");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error("\n[FAIL] Phase 5 Verification failed:", err);
  process.exit(1);
});
