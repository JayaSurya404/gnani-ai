import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VOICE_BY_LANGUAGE,
  getCompatibleVoices,
  isVoiceCompatible,
  resolveCanonicalVoice,
} from "../src/lib/voice-profiles";
import { getTwilioSayAttributes } from "../src/lib/telephony/gnani-tts";
import { generateLLMVoiceTurn } from "../src/lib/telephony/llm-voice-turn";
import { cleanLeadName, cleanLeadNotes, formatLeadSource } from "../src/lib/utils";

describe("VoiceNexus — Strict Voice & Language Compatibility Registry", () => {
  it("1. validates that every supported language has verified canonical profiles", () => {
    const requiredLanguages = ["ta-IN", "en-IN", "hi-IN", "te-IN", "kn-IN", "ml-IN", "indic-auto"];
    for (const lang of requiredLanguages) {
      const compatible = getCompatibleVoices(lang);
      assert.ok(compatible.length > 0, `Language ${lang} must have at least one compatible voice`);
      const defaultVoiceId = DEFAULT_VOICE_BY_LANGUAGE[lang];
      assert.ok(defaultVoiceId, `Language ${lang} must have a registered default voice`);
      assert.ok(compatible.some((v) => v.id === defaultVoiceId), `Default voice for ${lang} must be in compatible list`);
    }
  });

  it("2. enforces model invariants: timbre-v2.5 for language voices and timbre-v3.0 for multilingual Indic", () => {
    // Single language voices must strictly be timbre-v2.5
    const langVoices = ["Asmita", "Trisha", "Brinda", "Selvi", "Kaveri", "Pranav", "Devika", "Priya", "Nalini", "Deepak", "Aarav", "Chitra", "Suresh", "Ananya", "Arya"];
    for (const v of langVoices) {
      const resolved = resolveCanonicalVoice(v);
      assert.equal(resolved.model, "timbre-v2.5", `Voice ${v} must use model timbre-v2.5`);
    }

    // Multilingual Indic voices must strictly be timbre-v3.0
    const multiVoices = ["Shivani", "Avinash"];
    for (const v of multiVoices) {
      const resolved = resolveCanonicalVoice(v);
      assert.equal(resolved.model, "timbre-v3.0", `Voice ${v} must use model timbre-v3.0`);
    }
  });

  it("3. strictly resolves aliases to verified canonical provider voice identifiers", () => {
    // Tamil: Selvi -> Asmita
    assert.equal(resolveCanonicalVoice("Selvi").canonicalVoice, "Asmita");
    assert.equal(resolveCanonicalVoice("Selvi").personaName, "Selvi");

    // English: Priya -> Kaveri
    assert.equal(resolveCanonicalVoice("Priya").canonicalVoice, "Kaveri");
    assert.equal(resolveCanonicalVoice("Priya").personaName, "Priya");

    // Hindi: Aarav -> Deepak
    assert.equal(resolveCanonicalVoice("Aarav").canonicalVoice, "Deepak");
    assert.equal(resolveCanonicalVoice("Aarav").personaName, "Aarav");

    // Telugu: Suresh -> Girish
    assert.equal(resolveCanonicalVoice("Suresh").canonicalVoice, "Girish");
    assert.equal(resolveCanonicalVoice("Suresh").personaName, "Suresh");

    // Kannada: Ananya -> Vidya
    assert.equal(resolveCanonicalVoice("Ananya").canonicalVoice, "Vidya");
    assert.equal(resolveCanonicalVoice("Ananya").personaName, "Ananya");

    // Malayalam: Arya -> Reshma
    assert.equal(resolveCanonicalVoice("Arya").canonicalVoice, "Reshma");
    assert.equal(resolveCanonicalVoice("Arya").personaName, "Arya");
  });

  it("4. prevents cross-language mismatch in dependent dropdown filtering", () => {
    // Kannada dropdown must not contain Tamil Asmita or English Kaveri
    assert.equal(isVoiceCompatible("kn-IN", "Asmita"), false);
    assert.equal(isVoiceCompatible("kn-IN", "Kaveri"), false);
    assert.equal(isVoiceCompatible("kn-IN", "Ananya"), true);

    // Malayalam dropdown must not contain Hindi Nalini or Tamil Trisha
    assert.equal(isVoiceCompatible("ml-IN", "Nalini"), false);
    assert.equal(isVoiceCompatible("ml-IN", "Trisha"), false);
    assert.equal(isVoiceCompatible("ml-IN", "Arya"), true);

    // Telugu dropdown must not contain Kannada Ananya
    assert.equal(isVoiceCompatible("te-IN", "Ananya"), false);
    assert.equal(isVoiceCompatible("te-IN", "Chitra"), true);
    assert.equal(isVoiceCompatible("te-IN", "Suresh"), true);
  });

  it("5. guarantees same-language fallback attributes for Twilio <Say>", () => {
    assert.deepEqual(getTwilioSayAttributes("ta-IN"), { language: "ta-IN", voice: "Google.ta-IN-Standard-C" });
    assert.deepEqual(getTwilioSayAttributes("en-IN"), { language: "en-IN", voice: "Google.en-IN-Standard-A" });
    assert.deepEqual(getTwilioSayAttributes("hi-IN"), { language: "hi-IN", voice: "Google.hi-IN-Standard-A" });
    assert.deepEqual(getTwilioSayAttributes("te-IN"), { language: "te-IN", voice: "Google.te-IN-Standard-A" });
    assert.deepEqual(getTwilioSayAttributes("kn-IN"), { language: "kn-IN", voice: "Google.kn-IN-Standard-A" });
    assert.deepEqual(getTwilioSayAttributes("ml-IN"), { language: "ml-IN", voice: "Google.ml-IN-Standard-A" });
  });

  it("6. guarantees dynamic persona in LLM prompt and forbids duplicate introduction", async () => {
    const turn = await generateLLMVoiceTurn({
      userUtterance: "எவ்வளவு விலை ஆகும்?",
      conversationHistory: [],
      customerName: "Lakshmi Narayanan",
      personaName: "Trisha",
      language: "ta-IN",
      tenantContext: {
        businessName: "Kaveri Solar & Construction",
        businessCity: "Kumbakonam",
        businessState: "Tamil Nadu",
        products: [
          { name: "5HP Solar Agricultural Pump", price: "₹2,65,000", description: "Borewell solar pump" }
        ]
      },
      leadContext: {
        primaryInterest: "5HP Solar Agricultural Pump replacing diesel set",
        notes: "Farmer near Kumbakonam, Thanjavur"
      }
    });

    assert.ok(turn.text, "Response text must be non-empty");
    // Must NOT introduce herself again
    assert.ok(!turn.text.includes("நான் Kaveri Solar"), "Must not repeat self-introduction");
    assert.ok(!turn.text.includes("நிறுவனத்திலிருந்து பேசுகிறேன்"), "Must not repeat intro phrasing");
  });

  it("7. correctly grounds agricultural pump context for test lead Lakshmi Narayanan", async () => {
    const turn = await generateLLMVoiceTurn({
      userUtterance: "நான் விவசாயத்திற்கு டீசல் பம்புக்கு பதிலாக சோலார் போடலாமா?",
      conversationHistory: [],
      customerName: "Lakshmi Narayanan",
      personaName: "Asmita",
      language: "ta-IN",
      tenantContext: {
        businessName: "Kaveri Solar & Construction",
        businessCity: "Thanjavur",
        businessState: "Tamil Nadu",
        products: [
          { name: "5HP Solar Agriculture Pump", price: "₹2,65,000", description: "Daytime agricultural borewell irrigation" }
        ]
      },
      leadContext: {
        primaryInterest: "7.5kW Solar Agriculture Pump & Cold Store",
        notes: "[TEST_CONTACT] Lakshmi is a farmer near Kumbakonam, Thanjavur"
      }
    });

    assert.ok(turn.text.length > 5, "Response must provide grounded advice");
    // Verify response is concise (< 50 words) for live telephony
    const wordCount = turn.text.split(/\s+/).length;
    assert.ok(wordCount <= 45, `Spoken turn must be concise (got ${wordCount} words)`);
    // Verify test contact labels are absent from spoken response
    assert.ok(!turn.text.includes("[TEST_CONTACT]"), "Response must not contain [TEST_CONTACT]");
    assert.ok(!turn.text.toLowerCase().includes("sample lead"), "Response must not contain sample lead");
    assert.ok(!turn.text.toLowerCase().includes("test contact"), "Response must not contain test contact");
  });

  it("8. verifies customer-facing label sanitizer removes [TEST_CONTACT] and SAMPLE_LEAD", () => {
    // 1. Name cleaning
    assert.equal(cleanLeadName("[TEST_CONTACT] Lakshmi Narayanan"), "Lakshmi Narayanan");
    assert.equal(cleanLeadName("Lakshmi Narayanan"), "Lakshmi Narayanan");
    assert.equal(cleanLeadName(""), "Customer");
    assert.equal(cleanLeadName(null), "Customer");

    // 2. Notes cleaning
    const rawNotes = "[TEST_CONTACT] Lakshmi is a farmer near Kumbakonam, Thanjavur. Interested in replacing diesel pump sets with solar.";
    const cleanedNotes = cleanLeadNotes(rawNotes);
    assert.equal(cleanedNotes, "Lakshmi is a farmer near Kumbakonam, Thanjavur. Interested in replacing diesel pump sets with solar.");
    assert.ok(!cleanedNotes.includes("[TEST_CONTACT]"));

    // 3. Acquisition Source formatting
    assert.equal(formatLeadSource("SAMPLE_LEAD"), "Direct Consultation");
    assert.equal(formatLeadSource("WEBSITE_INQUIRY"), "Website Inquiry");
    assert.equal(formatLeadSource(""), "Website");
    assert.equal(formatLeadSource(null), "Website");
  });
});
