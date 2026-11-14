"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bot,
  Languages,
  Mic,
  ShieldCheck,
  Save,
  CheckCircle2,
  Play,
  Plus,
  Volume2,
  RotateCcw,
  Layers,
  History,
  FileCode,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { LanguageMode, Agent } from "@/lib/types";
import { INDUSTRY_TEMPLATES, IndustryAgentTemplate } from "@/lib/agent-templates";
import { GNANI_VOICE_CATALOG } from "@/lib/voice-profiles";
import { validatePrompt, VALID_PLACEHOLDERS } from "@/lib/prompt-builder";
import { VersionDiffModal, VersionSnapshot } from "@/components/agents/version-diff-modal";

type StudioTab = "PROMPT" | "TEMPLATES" | "LANGUAGE" | "VOICE" | "SAFETY" | "VERSIONS";

export default function AgentsPage() {
  const storeAgents = useWorkspaceStore((state) => state.agents);
  const [agentsList, setAgentsList] = useState<Agent[]>(storeAgents);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(storeAgents[0]?.id || "");

  const selectedAgent = agentsList.find((a) => a.id === selectedAgentId) || agentsList[0] || {
    id: "default-agent",
    name: "Selvi",
    role: "Solar Technical Consultant",
    languageMode: "AUTO",
    voiceId: "ta-IN-selvi",
    voiceName: "Selvi (Warm Tamil/Tanglish)",
    activeVersion: "v1.0",
    status: "ACTIVE",
    callCount: 0,
    avgDurationSec: 0,
    updatedAt: "Today",
  };

  const [activeTab, setActiveTab] = useState<StudioTab>("PROMPT");

  // Prompt Builder State
  const [promptText, setPromptText] = useState(
    selectedAgent.systemPrompt || INDUSTRY_TEMPLATES[0].systemPromptTemplate
  );
  const [greetingMessage, setGreetingMessage] = useState(
    selectedAgent.greetingMessage || "வணக்கம்! நான் Kaveri Solar & Construction நிறுவனத்திலிருந்து அஸ்மிதா பேசுகிறேன்."
  );
  const [turnTimeoutMs, setTurnTimeoutMs] = useState<number>(selectedAgent.turnTimeoutMs || 2500);
  const [maxDurationSec, setMaxDurationSec] = useState<number>(selectedAgent.maxDurationSeconds || 600);

  // Safety & Guardrails
  const [discloseAi, setDiscloseAi] = useState(true);
  const [honorDnc, setHonorDnc] = useState(true);
  const [enableEscalation, setEnableEscalation] = useState(true);

  // Language & Voice
  const [languageMode, setLanguageMode] = useState<LanguageMode>(selectedAgent.languageMode);
  const [voiceId, setVoiceId] = useState<string>(selectedAgent.voiceId);

  // Versioning state
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [versionNotes, setVersionNotes] = useState("");
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [diffTargetVersion, setDiffTargetVersion] = useState<VersionSnapshot | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Modals
  const [isNewAgentModalOpen, setIsNewAgentModalOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("SOLAR");

  // Load agents and versions from database on mount & selection
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.agents) && data.agents.length > 0) {
          setAgentsList(data.agents);
          if (!selectedAgentId || !data.agents.some((a: Agent) => a.id === selectedAgentId)) {
            setSelectedAgentId(data.agents[0].id);
          }
        }
      })
      .catch(() => {});
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedAgent?.id) return;
    fetch(`/api/agents/${selectedAgent.id}/versions`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.versions)) {
          setVersions(data.versions);
        }
      })
      .catch(() => {});
  }, [selectedAgent?.id]);

  // Validation report
  const validationReport = validatePrompt(promptText);

  // Handle template insertion
  const handleApplyTemplate = (tpl: IndustryAgentTemplate) => {
    setPromptText(tpl.systemPromptTemplate);
    setGreetingMessage(tpl.greetingInstructions);
    setLanguageMode(tpl.recommendedLanguage);
    setVoiceId(tpl.recommendedVoiceId);
    toast.success(`Loaded "${tpl.title}" template guidelines!`);
    setActiveTab("PROMPT");
  };

  // Handle token insertion into prompt
  const handleInsertToken = (token: string) => {
    setPromptText((prev) => `${prev} ${token}`);
    toast.info(`Inserted ${token}`);
  };

  // Preview voice sample via speech synthesis
  const handlePreviewVoice = (sampleText: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(sampleText);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      window.speechSynthesis.speak(utterance);
      toast.info("Playing synthesized voice sample…");
    } else {
      toast.info(`Voice sample: "${sampleText}"`);
    }
  };

  // Handle publishing a new immutable version
  const handlePublishVersion = async () => {
    if (!validationReport.isValid) {
      toast.error(`Cannot publish: ${validationReport.errors[0]}`);
      return;
    }

    setIsPublishing(true);
    try {
      const res = await fetch(`/api/agents/${selectedAgent.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: promptText,
          greetingMessage,
          turnTimeoutMs,
          maxDurationSeconds: maxDurationSec,
          notes: versionNotes.trim() || "Incremental optimization update",
          publish: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to publish version");
      }

      toast.success(`Snapshot ${data.version.versionNumber} published live to production!`);
      setVersions((prev) => [data.version, ...prev.map((v) => ({ ...v, isActive: false }))]);
      setSelectedAgentId(selectedAgent.id);
      setVersionNotes("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setIsPublishing(false);
    }
  };

  // Handle rollback
  const handleExecuteRollback = async (targetVersionId: string) => {
    setIsRollingBack(true);
    try {
      const res = await fetch(`/api/agents/${selectedAgent.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersionId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Rollback failed");
      }

      toast.success(data.message);
      setIsDiffModalOpen(false);

      // Refresh versions
      setVersions((prev) =>
        prev.map((v) => ({
          ...v,
          isActive: v.id === targetVersionId,
        }))
      );

      // Load prompt from that target version
      const targetV = versions.find((v) => v.id === targetVersionId);
      if (targetV) {
        setPromptText(targetV.systemPrompt);
        setGreetingMessage(targetV.greetingMessage);
        setTurnTimeoutMs(targetV.turnTimeoutMs);
        setMaxDurationSec(targetV.maxDurationSeconds);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setIsRollingBack(false);
    }
  };

  // Create new agent modal submit
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentRole.trim()) {
      toast.error("Please fill in agent name and role");
      return;
    }

    const tpl = INDUSTRY_TEMPLATES.find((t) => t.industryKey === selectedTemplateKey) || INDUSTRY_TEMPLATES[0];

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAgentName.trim(),
          roleTitle: newAgentRole.trim(),
          languageMode: tpl.recommendedLanguage,
          voiceId: tpl.recommendedVoiceId,
          voiceName: tpl.recommendedVoiceName,
          systemPrompt: tpl.systemPromptTemplate,
          greetingMessage: tpl.greetingInstructions,
          turnTimeoutMs: 2500,
          maxDurationSeconds: 600,
        }),
      });

      const data = await res.json();
      if (data?.success) {
        toast.success(`Agent "${newAgentName}" provisioned with baseline v1.0!`);
        setIsNewAgentModalOpen(false);
        setNewAgentName("");
        setNewAgentRole("");

        // Refresh agent list
        const agentsRes = await fetch("/api/agents");
        const aData = await agentsRes.json();
        if (aData?.success) {
          setAgentsList(aData.agents);
          setSelectedAgentId(data.agentId);
        }
      } else {
        toast.error(data?.error || "Failed to create agent");
      }
    } catch (err: unknown) {
      toast.error("Failed to create agent: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Toggle status (Active / Paused)
  const handleToggleStatus = async () => {
    const nextStatus = selectedAgent.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await fetch(`/api/agents/${selectedAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      setAgentsList((prev) =>
        prev.map((a) => (a.id === selectedAgent.id ? { ...a, status: nextStatus } : a))
      );
      toast.success(`Agent status updated to ${nextStatus}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const activeVersionObj = versions.find((v) => v.isActive) || null;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl flex items-center gap-2">
            AI Agent Studio
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
              Enterprise v2.0
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Configure multi-industry personas, prompt engineering, language directives, and immutable version snapshots.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href={`/playground?agentId=${selectedAgent.id}`}>
            <Button size="sm" variant="outline" className="gap-2 text-xs h-9">
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              Test in Playground
            </Button>
          </Link>

          <Button
            size="sm"
            onClick={() => setIsNewAgentModalOpen(true)}
            className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-xs h-9 font-medium shadow-md shadow-indigo-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Create New Agent
          </Button>
        </div>
      </div>

      {/* Agent Selector Bar */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 border-b border-[#222C3E]">
        {agentsList.map((agent) => (
          <button
            key={agent.id}
            onClick={() => {
              setSelectedAgentId(agent.id);
              if (agent.systemPrompt) setPromptText(agent.systemPrompt);
              if (agent.greetingMessage) setGreetingMessage(agent.greetingMessage);
              setLanguageMode(agent.languageMode);
              setVoiceId(agent.voiceId);
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              agent.id === selectedAgent.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-[#0E1420] text-slate-400 hover:text-white border border-[#222C3E]"
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            <span>{agent.name}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono">
              {agent.activeVersion || "v1.0"}
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                agent.status === "ACTIVE" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
          </button>
        ))}
      </div>

      {/* Main Studio Card */}
      <Card className="border-[#222C3E] bg-[#0A0D14] overflow-hidden">
        {/* Agent Metadata Subheader */}
        <div className="p-4 border-b border-[#222C3E] bg-[#0E1420] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">{selectedAgent.name}</h3>
                <span className="text-[11px] text-slate-400">• {selectedAgent.role}</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    selectedAgent.status === "ACTIVE"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {selectedAgent.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Active Snapshot: {selectedAgent.activeVersion || "v1.0"} • Voice: {selectedAgent.voiceName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleStatus}
              className="text-xs h-8"
            >
              {selectedAgent.status === "ACTIVE" ? "Pause Agent" : "Activate Agent"}
            </Button>

            <Button
              size="sm"
              disabled={isPublishing || !validationReport.isValid}
              onClick={handlePublishVersion}
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {isPublishing ? "Publishing Snapshot..." : "Publish Live Version"}
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#222C3E] bg-[#07090E] px-4 gap-2 overflow-x-auto">
          {[
            { id: "PROMPT", label: "Prompt Builder", icon: FileCode },
            { id: "TEMPLATES", label: "Industry Templates (8)", icon: Layers },
            { id: "LANGUAGE", label: "Language Policy", icon: Languages },
            { id: "VOICE", label: "Voice Persona & Consent", icon: Mic },
            { id: "SAFETY", label: "Safety & Guardrails", icon: ShieldCheck },
            { id: "VERSIONS", label: `Version History (${versions.length})`, icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as StudioTab)}
                className={`flex items-center gap-2 py-3 px-3 border-b-2 text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: PROMPT BUILDER */}
        {activeTab === "PROMPT" && (
          <div className="p-6 space-y-6">
            {/* Variable Tokens Chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Dynamic Variable Tokens (Click to insert)
                </span>
                <span className="text-[11px] text-slate-500">
                  Interpolated automatically from customer and business records
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VALID_PLACEHOLDERS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => handleInsertToken(token)}
                    className="px-2 py-1 rounded bg-[#0E1420] border border-[#222C3E] text-[11px] font-mono text-indigo-300 hover:border-indigo-500 hover:bg-indigo-500/10 transition"
                  >
                    + {token}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200">
                  System Instruction Prompt *
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  {validationReport.wordCount} words
                </span>
              </div>
              <textarea
                rows={12}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                className="w-full rounded-lg border border-[#222C3E] bg-[#07090E] p-4 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                placeholder="Enter system prompt instructions..."
              />
            </div>

            {/* Validation Feedback */}
            {(!validationReport.isValid || validationReport.warnings.length > 0) && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1 text-xs text-amber-300">
                {validationReport.errors.map((err, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-rose-400">
                    <AlertCircle className="h-3.5 w-3.5" /> {err}
                  </p>
                ))}
                {validationReport.warnings.map((warn, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-amber-300">
                    <HelpCircle className="h-3.5 w-3.5" /> {warn}
                  </p>
                ))}
              </div>
            )}

            {/* Opening Greeting */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Initial Greeting Utterance *
                </label>
                <Input
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  className="text-xs bg-[#07090E]"
                />
                <p className="text-[10px] text-slate-500">
                  Spoken in the very first turn when call establishes. Must state AI identity.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Version Snapshot Notes (Optional)
                </label>
                <Input
                  placeholder="e.g. Added subsidy objection guidance"
                  value={versionNotes}
                  onChange={(e) => setVersionNotes(e.target.value)}
                  className="text-xs bg-[#07090E]"
                />
              </div>
            </div>

            {/* Timing Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#222C3E]">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Turn Timeout</span>
                  <span className="font-mono text-white">{turnTimeoutMs}ms</span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={5000}
                  step={250}
                  value={turnTimeoutMs}
                  onChange={(e) => setTurnTimeoutMs(Number(e.target.value))}
                  className="w-full accent-indigo-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Max Call Duration</span>
                  <span className="font-mono text-white">{maxDurationSec} seconds</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={1800}
                  step={60}
                  value={maxDurationSec}
                  onChange={(e) => setMaxDurationSec(Number(e.target.value))}
                  className="w-full accent-indigo-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: MULTI-INDUSTRY TEMPLATES */}
        {activeTab === "TEMPLATES" && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white">Pre-Engineered Industry Templates</h3>
              <p className="text-xs text-slate-400">
                Instantly load calibrated conversation objectives, objection scripts, and qualification questions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {INDUSTRY_TEMPLATES.map((tpl) => (
                <Card
                  key={tpl.id}
                  className="p-4 border-[#222C3E] bg-[#0E1420] hover:border-indigo-500/50 transition flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {tpl.industry}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{tpl.recommendedLanguage}</span>
                    </div>

                    <h4 className="font-bold text-sm text-white">{tpl.title}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{tpl.description}</p>

                    <div className="space-y-1 text-[11px] text-slate-400 pt-2 border-t border-[#1E2738]">
                      <span className="text-slate-500 block font-semibold uppercase text-[9px]">Sample Objectives:</span>
                      {tpl.conversationObjectives.slice(0, 2).map((obj, i) => (
                        <p key={i} className="flex items-center gap-1.5 text-slate-300">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> {obj}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#222C3E] flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-mono">
                      Voice: {tpl.recommendedVoiceName.split(" ")[0]}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleApplyTemplate(tpl)}
                      className="text-xs h-8 bg-indigo-600 hover:bg-indigo-500 font-medium"
                    >
                      Load Template <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: LANGUAGE POLICY */}
        {activeTab === "LANGUAGE" && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white">Multilingual Dialect & Code-Switching Policy</h3>
              <p className="text-xs text-slate-400">
                Define how the agent handles mixed colloquial speech, regional registers, and turn-taking adaptation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  id: "AUTO",
                  title: "Dynamic Auto-Adaptation (Recommended)",
                  desc: "Analyzes caller utterance turn-by-turn. Seamlessly matches English, Tamil, or Tanglish without breaking persona.",
                  badge: "Turn-by-turn STT Language Identification",
                },
                {
                  id: "TANGLISH",
                  title: "Conversational Tanglish",
                  desc: "Natural Tamil-English colloquial blend common among urban Indian homeowners. Keeps technical terms in English.",
                  badge: "Colloquial Code-Switching",
                },
                {
                  id: "TAMIL",
                  title: "Pure Colloquial Tamil",
                  desc: "Polite spoken Tamil (Madras & Coimbatore business register) with respectful honorifics (Vanakkam, Nandri).",
                  badge: "Regional Vernacular",
                },
                {
                  id: "ENGLISH",
                  title: "Professional Indian English",
                  desc: "Clear, courteous corporate English with standard Indian business cadence.",
                  badge: "Corporate Standard",
                },
              ].map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => setLanguageMode(opt.id as LanguageMode)}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    languageMode === opt.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-[#222C3E] bg-[#0E1420] hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-white">{opt.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-black/40 text-indigo-300 font-mono">
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: VOICE PERSONA & CONSENT */}
        {activeTab === "VOICE" && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white">Gnani Timbre Voice Profile Catalog</h3>
              <p className="text-xs text-slate-400">
                Select an authorized voice model. Each profile features verified consent records for ethical compliance.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {GNANI_VOICE_CATALOG.map((v) => (
                <Card
                  key={v.id}
                  className={`p-4 border transition flex flex-col justify-between ${
                    voiceId === v.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-[#222C3E] bg-[#0E1420]"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{v.name}</span>
                        <span className="text-[10px] text-slate-400">({v.gender})</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck className="h-3 w-3" /> Consent Verified
                      </span>
                    </div>

                    <p className="text-xs text-indigo-300 font-medium">{v.language} • {v.tone}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{v.description}</p>

                    <div className="p-2.5 rounded bg-[#07090E] border border-[#1E2738] text-[11px] text-slate-300 font-mono mt-2">
                      &quot;{v.sampleText}&quot;
                    </div>

                    <div className="text-[10px] text-slate-500 font-mono pt-1">
                      Actor: {v.consent.speakerName} • Ref: {v.consent.consentRef}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#222C3E] flex items-center justify-between">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePreviewVoice(v.sampleText)}
                      className="text-xs h-8 gap-1.5"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                      Audition Voice
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => {
                        setVoiceId(v.id);
                        toast.success(`Assigned voice "${v.name}" to agent!`);
                      }}
                      className={`text-xs h-8 ${
                        voiceId === v.id
                          ? "bg-emerald-600 text-white"
                          : "bg-indigo-600 hover:bg-indigo-500"
                      }`}
                    >
                      {voiceId === v.id ? "Selected Voice" : "Assign Voice"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: SAFETY & GUARDRAILS */}
        {activeTab === "SAFETY" && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white">Enterprise Safety & Regulatory Compliance</h3>
              <p className="text-xs text-slate-400">
                Enforce TRAI and global telecom compliance guardrails automatically across all voice turns.
              </p>
            </div>

            <div className="space-y-4 max-w-2xl">
              <div className="p-4 rounded-xl border border-[#222C3E] bg-[#0E1420] flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Mandatory AI Identity Disclosure</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Requires the agent to state in its first sentence: &quot;I am an AI assistant calling on behalf of [Business]...&quot;
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={discloseAi}
                  onChange={(e) => setDiscloseAi(e.target.checked)}
                  className="accent-indigo-600 h-4 w-4 mt-1"
                />
              </div>

              <div className="p-4 rounded-xl border border-[#222C3E] bg-[#0E1420] flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Immediate Do-Not-Call (DNC) Opt-Out</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    If caller says &quot;not interested&quot; or &quot;stop calling&quot;, agent acknowledges politely and ends the call. Never argues.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={honorDnc}
                  onChange={(e) => setHonorDnc(e.target.checked)}
                  className="accent-indigo-600 h-4 w-4 mt-1"
                />
              </div>

              <div className="p-4 rounded-xl border border-[#222C3E] bg-[#0E1420] flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Human Engineer Escalation Trigger</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Transfers or schedules a human callback whenever the customer requests a manager or engineer.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enableEscalation}
                  onChange={(e) => setEnableEscalation(e.target.checked)}
                  className="accent-indigo-600 h-4 w-4 mt-1"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: VERSION HISTORY */}
        {activeTab === "VERSIONS" && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Immutable Version Snapshots</h3>
                <p className="text-xs text-slate-400">
                  Every published release creates an immutable database snapshot. Historical releases can be inspected or restored.
                </p>
              </div>

              <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                {versions.length} Snapshots Stored
              </span>
            </div>

            {versions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-lg border border-dashed border-[#222C3E]">
                No historical versions found for this agent yet. Click &quot;Publish Live Version&quot; to create your first snapshot.
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((ver) => (
                  <div
                    key={ver.id}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                      ver.isActive
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-[#222C3E] bg-[#0E1420] hover:border-slate-700"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-sm text-white">{ver.versionNumber}</span>
                        {ver.isActive ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            CURRENT LIVE
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">Archived Snapshot</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{ver.notes}</p>
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {new Date(ver.createdAt).toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDiffTargetVersion(ver);
                          setIsDiffModalOpen(true);
                        }}
                        className="text-xs h-8"
                      >
                        Inspect & Diff
                      </Button>

                      {!ver.isActive && (
                        <Button
                          size="sm"
                          onClick={() => handleExecuteRollback(ver.id)}
                          className="text-xs h-8 bg-amber-600 hover:bg-amber-500 text-white font-medium gap-1"
                        >
                          <RotateCcw className="h-3 w-3" /> Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Version Diff Modal */}
      <VersionDiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        activeVersion={activeVersionObj}
        selectedVersion={diffTargetVersion}
        onRollback={handleExecuteRollback}
        isRollingBack={isRollingBack}
      />

      {/* Create New Agent Modal */}
      <Dialog open={isNewAgentModalOpen} onOpenChange={setIsNewAgentModalOpen}>
        <DialogContent className="max-w-xl bg-[#0E1420] border-[#222C3E] text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white">
              Provision New AI Voice Agent
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Select an industry template to automatically configure objectives, prompts, and voice settings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAgent} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Agent Persona Name *</label>
                <Input
                  required
                  placeholder="e.g. Priya or Anand"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Role Title *</label>
                <Input
                  required
                  placeholder="e.g. Admissions Advisor"
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Target Industry Template *</label>
              <select
                value={selectedTemplateKey}
                onChange={(e) => {
                  setSelectedTemplateKey(e.target.value);
                  const t = INDUSTRY_TEMPLATES.find((item) => item.industryKey === e.target.value);
                  if (t && !newAgentRole) setNewAgentRole(t.roleTitle);
                }}
                className="w-full rounded-lg border border-[#222C3E] bg-[#07090E] p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {INDUSTRY_TEMPLATES.map((t) => (
                  <option key={t.industryKey} value={t.industryKey}>
                    {t.industry} — {t.title}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewAgentModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold"
              >
                Deploy Agent
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
