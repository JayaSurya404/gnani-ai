import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PublicPageClient from "./public-page-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const admin = createAdminClient();
  const supabase = admin ?? (await createClient());

  const { data: page } = await supabase
    .from("business_pages")
    .select("title, meta_description, hero_headline, businesses(name)")
    .eq("slug", slug)
    .maybeSingle();

  if (page) {
    const biz = Array.isArray(page.businesses) ? page.businesses[0] : page.businesses;
    const bizName = (biz as { name?: string })?.name || "VoiceNexus";
    return {
      title: `${page.title || page.hero_headline || bizName} — VoiceNexus Verified`,
      description: page.meta_description || `Official verified public business portal for ${bizName}. Instant consultation and transparent quotations.`,
    };
  }

  return {
    title: `${slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} — Official Business Page`,
    description: "Verified business profile and solar consultation portal.",
  };
}

export default async function PublicBusinessPage({ params }: PageProps) {
  const { slug } = await params;
  const admin = createAdminClient();
  const supabase = admin ?? (await createClient());

  // 1. Fetch published page and associated business data
  const { data: pageData } = await supabase
    .from("business_pages")
    .select(`
      id,
      slug,
      title,
      meta_description,
      hero_headline,
      hero_subheadline,
      published,
      theme_config,
      businesses (
        id,
        organization_id,
        name,
        legal_name,
        tagline,
        description,
        phone,
        email,
        website,
        address_line1,
        city,
        state,
        pincode,
        country,
        business_hours
      )
    `)
    .eq("slug", slug)
    .maybeSingle();

  // If found in Supabase
  if (pageData && pageData.businesses) {
    if (!pageData.published) {
      return (
        <div className="min-h-screen bg-[#07090E] flex flex-col items-center justify-center text-center p-6">
          <div className="max-w-md space-y-4 rounded-xl border border-[#222C3E] bg-[#0E1420] p-8 text-slate-200 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
              <span className="font-bold text-lg font-mono">!</span>
            </div>
            <h2 className="text-xl font-bold text-white">Business Page in Draft Mode</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              This public portal (<span className="font-mono text-indigo-400">{pageData.slug}</span>) is currently unpublished by the business owner. Please check back later or contact the business directly.
            </p>
          </div>
        </div>
      );
    }

    const rawBiz = Array.isArray(pageData.businesses) ? pageData.businesses[0] : pageData.businesses;
    const biz = rawBiz as {
      id: string;
      organization_id: string;
      name: string;
      legal_name?: string;
      tagline?: string;
      description?: string;
      phone?: string;
      email?: string;
      website?: string;
      address_line1?: string;
      city?: string;
      state?: string;
      pincode?: string;
      country?: string;
      business_hours?: Record<string, unknown>;
    };

    // Fetch products
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku, description, category, price_amount, price_display, currency, is_active")
      .eq("business_id", biz.id)
      .eq("is_active", true);

    const themeConfig = (pageData.theme_config as Record<string, unknown>) || {};
    const cleanStr = (val: unknown) => (typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined);

    const socialLinks: Record<string, string | undefined> = {
      whatsapp: cleanStr(themeConfig.whatsapp) || (biz.phone ? `https://wa.me/${biz.phone.replace(/[^0-9]/g, "")}` : undefined),
      instagram: cleanStr(themeConfig.instagram),
      facebook: cleanStr(themeConfig.facebook),
      telegram: cleanStr(themeConfig.telegram),
      twitter: cleanStr(themeConfig.twitter),
      snapchat: cleanStr(themeConfig.snapchat),
      youtube: cleanStr(themeConfig.youtube),
      linkedin: cleanStr(themeConfig.linkedin),
      threads: cleanStr(themeConfig.threads),
      pinterest: cleanStr(themeConfig.pinterest),
      tiktok: cleanStr(themeConfig.tiktok),
      github: cleanStr(themeConfig.github),
      discord: cleanStr(themeConfig.discord),
    };

    return (
      <PublicPageClient
        isDemo={false}
        business={{
          id: biz.id,
          organizationId: biz.organization_id,
          name: biz.name || "Kaveri Solar & Construction",
          legalName: biz.legal_name || biz.name,
          tagline: biz.tagline || "Turnkey Solar EPC & Sustainable Engineering Construction",
          description: biz.description || "Premier rooftop solar EPC and engineering construction consultancy in Coimbatore, Tamil Nadu.",
          phone: biz.phone || "+91 6382868845",
          email: biz.email || "chitrasivakumar280@gmail.com",
          website: biz.website || "",
          city: biz.city || "Coimbatore",
          state: biz.state || "Tamil Nadu",
          country: biz.country || "India",
          socialLinks,
        }}
        page={{
          slug: pageData.slug,
          headline: pageData.hero_headline || "High-Yield Rooftop Solar & Precision Engineering Construction",
          subheadline: pageData.hero_subheadline || "MNRE-approved solar EPC, PM Surya Ghar subsidy assistance, and rapid commissioning.",
        }}
        products={products && products.length > 0 ? products : []}
      />
    );
  }

  return notFound();
}

