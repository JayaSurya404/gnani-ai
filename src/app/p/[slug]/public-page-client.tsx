"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sun,
  ShieldCheck,
  CheckCircle2,
  Phone,
  PhoneCall,
  MapPin,
  Clock,
  Sparkles,
  Zap,
  Calculator,
  ArrowRight,
  ShieldAlert,
  MessageCircle,
  Instagram,
  Facebook,
  Youtube,
  Linkedin,
  Github,
  Twitter,
  Send,
  MessageSquare,
  Share2,
  Pin,
  Video,
  Ghost,
  Mail,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { sendVisitorEvent } from "@/lib/visitor-tracker";
import { SUPPORTED_SOCIAL_PLATFORMS, isValidSocialUrl } from "@/lib/social-links";

interface BusinessInfo {
  id: string;
  organizationId: string;
  name: string;
  legalName?: string;
  tagline: string;
  description: string;
  phone: string;
  email: string;
  website: string;
  city: string;
  state: string;
  country: string;
  socialLinks?: Record<string, string | undefined>;
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
}

interface PageInfo {
  slug: string;
  headline: string;
  subheadline: string;
}

interface ProductItem {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  price_display?: string | null;
  category?: string | null;
}

interface Props {
  business: BusinessInfo;
  page: PageInfo;
  products: ProductItem[];
  isDemo?: boolean;
}

export default function PublicPageClient({ business, page, products }: Props) {
  const startTimeRef = useRef<number>(0);
  const [hasInteractedWithCalc, setHasInteractedWithCalc] = useState(false);

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  // Calculator state
  const [monthlyBill, setMonthlyBill] = useState<number>(4500);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [requirement, setRequirement] = useState("Residential Rooftop (3kW - 10kW)");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedLeadId, setConfirmedLeadId] = useState<string | null>(null);

  // Calculations based on Tamil Nadu / India average tariffs (approx ₹8.50/unit)
  const estimatedUnitsPerMonth = Math.round(monthlyBill / 8.5);
  const recommendedKw = Math.max(1, Math.round((estimatedUnitsPerMonth / 120) * 10) / 10);
  const estimatedMonthlySavings = Math.round(monthlyBill * 0.85);
  const estimatedAnnualSavings = estimatedMonthlySavings * 12;
  const estimatedSubsidy = recommendedKw <= 2 ? 60000 : recommendedKw <= 3 ? 78000 : 78000;

  // Track page view and abandonment on mount
  useEffect(() => {
    sendVisitorEvent({
      eventType: "PAGE_VIEW",
      organizationId: business.organizationId,
      metadata: {
        slug: page.slug,
        businessName: business.name,
        businessId: business.id.startsWith("demo") ? undefined : business.id,
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
      },
    });

    const handleBeforeUnload = () => {
      const dwellSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (dwellSeconds > 5 && !submitSuccess) {
        sendVisitorEvent({
          eventType: "ABANDONED_FORM",
          organizationId: business.organizationId,
          dwellTimeSeconds: dwellSeconds,
          metadata: {
            slug: page.slug,
            lastMonthlyBill: monthlyBill,
          },
        });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [business.id, business.organizationId, business.name, page.slug, monthlyBill, submitSuccess]);

  const handleSubmitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const cleanPhone = phone.replace(/[^0-9+]/g, "").trim();
    if (!name.trim() || cleanPhone.length < 10) {
      setSubmitError("Please enter a valid full name and 10-digit mobile number.");
      return;
    }

    setIsSubmitting(true);
    const dwellSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const utmSource = urlParams.get("utm_source") || "Public Business Page";
      const utmMedium = urlParams.get("utm_medium") || "Direct Inbound";
      const utmCampaign = urlParams.get("utm_campaign") || page.slug;

      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: cleanPhone,
          email: email.trim() || undefined,
          organizationId: business.organizationId,
          businessId: business.id.startsWith("demo") ? undefined : business.id,
          primaryInterest: selectedProduct ? selectedProduct.name : requirement,
          productId: selectedProduct?.id?.startsWith("p") ? undefined : selectedProduct?.id,
          productSku: selectedProduct?.sku || undefined,
          productName: selectedProduct?.name || undefined,
          monthlyBill: String(monthlyBill),
          systemSize: `${recommendedKw} kW`,
          utmSource,
          utmMedium,
          utmCampaign,
          dwellTimeSeconds: dwellSeconds,
          hasInteractedWithCalculator: hasInteractedWithCalc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit enquiry. Please try again.");
      }

      setSubmitSuccess(true);
      setConfirmedLeadId(data.leadId);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#0F172A] antialiased selection:bg-orange-500/20 selection:text-orange-700">
      {/* Top Banner with Verified Business Credentials */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-xs">
              <Sun className="h-5 w-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 tracking-tight">{business.name}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                  <ShieldCheck className="h-3 w-3" /> Verified Business
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">{business.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {business.whatsapp && (
              <a
                href={`https://wa.me/${business.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hello ${business.name}, I am visiting your consultation portal.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 shadow-xs transition"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                <span className="hidden sm:inline">WhatsApp</span>
              </a>
            )}

            <a
              href={`tel:${business.phone}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:border-orange-500 hover:text-orange-600 shadow-xs transition"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Hotline:</span> {business.phone}
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-16 md:pb-20 border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Hero Pitch */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">
                <Sparkles className="h-3.5 w-3.5 text-orange-600" />
                Verified Commercial &amp; Residential Consultation Portal
              </div>

              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
                {page.headline}
              </h1>

              <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-2xl">
                {page.subheadline}
              </p>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center shadow-xs">
                  <div className="text-xl md:text-2xl font-bold text-orange-600">85%</div>
                  <div className="text-[11px] text-slate-500 font-semibold">Bill Reduction</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center shadow-xs">
                  <div className="text-xl md:text-2xl font-bold text-emerald-600">25 Yrs</div>
                  <div className="text-[11px] text-slate-500 font-semibold">Performance Warranty</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center shadow-xs">
                  <div className="text-xl md:text-2xl font-bold text-blue-600">7 Days</div>
                  <div className="text-[11px] text-slate-500 font-semibold">Fast Turnaround</div>
                </div>
              </div>
            </div>

            {/* Right Interactive Solar Calculator */}
            <div className="lg:col-span-5">
              <Card className="p-6 rounded-3xl border border-slate-200 bg-white shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-orange-600" />
                    <h3 className="font-bold text-sm text-slate-900">Instant Solar ROI Calculator</h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Live Estimate</span>
                </div>

                <div className="space-y-5 pt-4">
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="text-xs font-semibold text-slate-700">Average Monthly Electricity Bill</label>
                      <span className="text-base font-bold text-orange-600 font-mono">₹{monthlyBill.toLocaleString("en-IN")}</span>
                    </div>
                    <input
                      type="range"
                      min={1000}
                      max={100000}
                      step={500}
                      value={monthlyBill}
                      onChange={(e) => {
                        setMonthlyBill(Number(e.target.value));
                        setHasInteractedWithCalc(true);
                      }}
                      className="w-full accent-orange-600 bg-slate-200 h-2 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                      <span>₹1,000/mo</span>
                      <span>₹25,000/mo</span>
                      <span>₹1,00,000/mo</span>
                    </div>
                  </div>

                  {/* Calculated metrics */}
                  <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Recommended System</span>
                      <p className="text-sm font-bold text-slate-900 font-mono">{recommendedKw} kW Capacity</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Estimated Savings</span>
                      <p className="text-sm font-bold text-emerald-600 font-mono">₹{estimatedMonthlySavings.toLocaleString("en-IN")}/mo</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">PM Subsidy Guidance</span>
                      <p className="text-sm font-bold text-blue-600 font-mono">Up to ₹{estimatedSubsidy.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Annual Electricity Offset</span>
                      <p className="text-sm font-bold text-slate-900 font-mono">₹{estimatedAnnualSavings.toLocaleString("en-IN")}/yr</p>
                    </div>
                  </div>

                  <a href="#consultation-form">
                    <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold h-10 gap-2 shadow-xs">
                      Claim Verified Subsidy &amp; Quotation
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions / Products Grid */}
      <section className="py-16 border-b border-slate-200/80 bg-white">
        <div className="max-w-6xl mx-auto px-4 space-y-8">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-orange-600">Standard Packages</h2>
            <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">Turnkey Solutions &amp; Advisory</h3>
            <p className="text-xs text-slate-500">
              Select a solution below to pre-fill your consultation request.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {products.map((prod) => (
              <div
                key={prod.id}
                onClick={() => {
                  setSelectedProduct(prod);
                  setRequirement(prod.name);
                  document.getElementById("consultation-form")?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`rounded-2xl border p-5 space-y-3 cursor-pointer transition-all ${selectedProduct?.id === prod.id
                    ? "border-orange-500 bg-orange-50/20 shadow-md ring-2 ring-orange-500/20"
                    : "border-slate-200 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-sm"
                  }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-sm text-slate-900">{prod.name}</span>
                  {prod.price_display && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full shrink-0">
                      {prod.price_display}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed min-h-[48px]">
                  {prod.description}
                </p>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-semibold text-slate-500">{prod.category || "Solar EPC"}</span>
                  <span className="text-[11px] font-bold text-orange-600 flex items-center gap-1">
                    Select Solution <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Consultation Request Form */}
      <section id="consultation-form" className="py-16">
        <div className="max-w-2xl mx-auto px-4">
          <Card className="p-8 rounded-3xl border border-slate-200 bg-white shadow-xl">
            {submitSuccess ? (
              <div className="text-center py-6 space-y-4 animate-in fade-in">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Consultation Request Received!</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  Thank you, <strong className="text-slate-900">{name}</strong>. Your enquiry has been received and prioritized. Our VoiceNexus AI specialist will connect with you on <strong className="text-slate-900">{phone}</strong> shortly.
                </p>

                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-xs text-left space-y-1.5 max-w-sm mx-auto">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Reference ID:</span>
                    <span className="font-mono text-slate-900 font-bold">{confirmedLeadId?.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Selected System:</span>
                    <span className="font-bold text-slate-900">{selectedProduct ? selectedProduct.name : `${recommendedKw} kW System`}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Hotline Support:</span>
                    <span className="font-mono text-emerald-700 font-bold">{business.phone}</span>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitEnquiry} className="space-y-4">
                <div className="text-center space-y-1 pb-2">
                  <h3 className="text-xl font-bold text-slate-900">Request Technical Feasibility &amp; Callback</h3>
                  <p className="text-xs text-slate-500">
                    Direct consultation with PM Surya Ghar subsidy claim verification.
                  </p>
                </div>

                {submitError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {selectedProduct && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-600 shrink-0" />
                      <div>
                        <span>Selected Package: </span>
                        <strong className="text-slate-900">{selectedProduct.name}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="text-[11px] text-slate-500 hover:text-slate-900 font-semibold underline ml-2 shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Full Name *</label>
                    <Input
                      required
                      placeholder="e.g. Arun Kumar"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="text-xs bg-white border-slate-200"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Mobile Phone *</label>
                    <Input
                      required
                      type="tel"
                      placeholder="e.g. 9840123456"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="text-xs bg-white border-slate-200 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Email Address (Optional)</label>
                    <Input
                      type="email"
                      placeholder="e.g. arun@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="text-xs bg-white border-slate-200"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Requirement Type *</label>
                    <select
                      value={requirement}
                      onChange={(e) => setRequirement(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 shadow-xs"
                    >
                      <option value="Residential Rooftop (3kW - 10kW)">Residential Rooftop (3kW - 10kW)</option>
                      <option value="Commercial Office Rooftop (10kW - 50kW)">Commercial Office Rooftop (10kW - 50kW)</option>
                      <option value="Industrial Factory / Mill (50kW - 250kW+)">Industrial Factory / Mill (50kW - 250kW+)</option>
                      <option value="Agricultural Solar Pump / Microgrid">Agricultural Solar Pump / Microgrid</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-600" />
                    <span className="text-slate-600">Calculated Requirement:</span>
                  </div>
                  <span className="font-mono font-bold text-orange-600">
                    {recommendedKw} kW • ₹{monthlyBill.toLocaleString("en-IN")}/mo bill
                  </span>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold h-11 gap-2 shadow-sm rounded-xl"
                >
                  {isSubmitting ? "Registering Inbound Request..." : "Submit Consultation Request"}
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-[11px] text-center text-slate-500">
                  By submitting, you agree to receive a technical feasibility callback. We strictly respect your privacy.
                </p>
              </form>
            )}
          </Card>
        </div>
      </section>

      {/* Official Communication & Social Channels (13 Supported Platforms) */}
      <section className="py-10 border-t border-slate-200/80 bg-white/60">
        <div className="max-w-6xl mx-auto px-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">Official Communication &amp; Social Channels</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                    <ShieldCheck className="h-3 w-3" /> Verified by Business
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Connect directly with our engineering and consultation desk via our verified official handles:
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`tel:${business.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-orange-500 hover:text-orange-600 transition shadow-xs"
                >
                  <PhoneCall className="h-3.5 w-3.5 text-orange-600" />
                  <span>Call {business.phone}</span>
                </a>
                {business.email && (
                  <a
                    href={`mailto:${business.email}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-orange-500 hover:text-orange-600 transition shadow-xs"
                  >
                    <Mail className="h-3.5 w-3.5 text-slate-600" />
                    <span>Email Us</span>
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {/* WhatsApp direct CTA */}
              <a
                href={business.socialLinks?.whatsapp || (business.whatsapp ? (business.whatsapp.startsWith("http") ? business.whatsapp : `https://wa.me/${business.whatsapp.replace(/[^0-9]/g, "")}`) : "https://wa.me/916382868845")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-xs ring-1 transition hover:opacity-95 bg-emerald-50 text-emerald-800 ring-emerald-200"
              >
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                <span>WhatsApp Official</span>
                <ArrowRight className="h-3 w-3 opacity-60" />
              </a>

              {/* Instagram direct CTA */}
              {(business.socialLinks?.instagram || business.instagram) && (
                <a
                  href={business.socialLinks?.instagram || business.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-xs ring-1 transition hover:opacity-95 bg-rose-50 text-rose-800 ring-rose-200"
                >
                  <Instagram className="h-4 w-4 text-rose-600" />
                  <span>Instagram Profile</span>
                  <ArrowRight className="h-3 w-3 opacity-60" />
                </a>
              )}

              {/* Remaining platforms rendered dynamically ONLY if configured */}
              {SUPPORTED_SOCIAL_PLATFORMS.filter(p => p.key !== "whatsapp" && p.key !== "instagram").map((platform) => {
                const url = business.socialLinks?.[platform.key];
                if (!url || !isValidSocialUrl(url)) return null;

                const getIcon = () => {
                  switch (platform.key) {
                    case "facebook": return <Facebook className="h-4 w-4 text-blue-600" />;
                    case "telegram": return <Send className="h-4 w-4 text-sky-500" />;
                    case "twitter": return <Twitter className="h-4 w-4 text-slate-900" />;
                    case "snapchat": return <Ghost className="h-4 w-4 text-amber-500" />;
                    case "youtube": return <Youtube className="h-4 w-4 text-red-600" />;
                    case "linkedin": return <Linkedin className="h-4 w-4 text-blue-700" />;
                    case "threads": return <Share2 className="h-4 w-4 text-slate-800" />;
                    case "pinterest": return <Pin className="h-4 w-4 text-red-700" />;
                    case "tiktok": return <Video className="h-4 w-4 text-teal-700" />;
                    case "github": return <Github className="h-4 w-4 text-slate-900" />;
                    case "discord": return <MessageSquare className="h-4 w-4 text-indigo-600" />;
                    default: return <Globe className="h-4 w-4 text-slate-600" />;
                  }
                };

                return (
                  <a
                    key={platform.key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-xs ring-1 transition hover:opacity-95 ${platform.badgeBg} ${platform.badgeText} ${platform.badgeRing}`}
                  >
                    {getIcon()}
                    <span>{platform.name}</span>
                    <ArrowRight className="h-3 w-3 opacity-60" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Verified Business Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left">
            <p className="font-bold text-slate-900">{business.legalName || business.name}</p>
            <p className="text-[11px] text-slate-500 flex items-center gap-2 justify-center md:justify-start">
              <MapPin className="h-3 w-3 text-orange-600" /> {business.city}, {business.state}, {business.country}
            </p>
          </div>

          <div className="flex items-center gap-4 text-slate-600">
            {business.website && (
              <a href={business.website} target="_blank" rel="noopener noreferrer" title="Official Website" className="hover:text-slate-900 transition">
                <Globe className="h-4 w-4" />
              </a>
            )}
            {(business.socialLinks?.whatsapp || business.whatsapp) && (
              <a href={business.socialLinks?.whatsapp || (business.whatsapp?.startsWith("http") ? business.whatsapp : `https://wa.me/${business.whatsapp?.replace(/[^0-9]/g, "")}`)} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="hover:text-emerald-600 transition">
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
            {(business.socialLinks?.instagram || business.instagram) && (
              <a href={business.socialLinks?.instagram || business.instagram} target="_blank" rel="noopener noreferrer" title="Instagram" className="hover:text-rose-600 transition">
                <Instagram className="h-4 w-4" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-6 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-500">
              <Clock className="h-3 w-3 text-emerald-600" /> Mon - Sat 09:00 AM - 06:30 PM IST
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              Powered by <span className="font-bold text-slate-900">Voice<span className="text-orange-600">Nexus</span> AI</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
