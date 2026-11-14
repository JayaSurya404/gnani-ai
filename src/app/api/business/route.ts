import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/actions/organization";

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const { searchParams } = new URL(req.url);
    let orgId = searchParams.get("organizationId");
    if (!orgId) {
      orgId = await getActiveOrganizationId();
    }

    if (!orgId) {
      console.warn("[/api/business] No active organization found for session");
      return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
    }

    // Query businesses
    const { data: businesses, error: bizErr } = await supabase
      .from("businesses")
      .select("*")
      .eq("organization_id", orgId)
      .limit(1);

    if (bizErr) {
      return NextResponse.json({ success: false, error: bizErr.message }, { status: 500 });
    }

    const business = businesses && businesses.length > 0 ? businesses[0] : null;
    if (!business) {
      console.warn(`[/api/business] No business record found for organization ${orgId}`);
      return NextResponse.json({ success: false, error: "Business profile not found." }, { status: 404 });
    }

    // Query business_pages
    const { data: pages } = await supabase
      .from("business_pages")
      .select("*")
      .eq("business_id", business.id)
      .limit(1);

    // Query products
    const { data: products } = await supabase
      .from("products")
      .select("*")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      success: true,
      business,
      page: pages && pages.length > 0 ? pages[0] : null,
      products: products || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
    }

    const {
      organizationId,
      name,
      tagline,
      phone,
      email,
      website,
      city,
      address,
      hours,
      slug,
      published = true,
      headline,
      subheadline,
      whatsapp,
      instagram,
      facebook,
      telegram,
      twitter,
      snapchat,
      youtube,
      linkedin,
      threads,
      pinterest,
      tiktok,
      github,
      discord,
      socialLinks,
      newProduct,
    } = body;

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    // Resolve business for this organization
    let resolvedOrgId = organizationId;
    if (!resolvedOrgId) {
      resolvedOrgId = await getActiveOrganizationId();
      if (!resolvedOrgId) {
        return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
      }
    }

    // Find or create business
    const { data: existingBiz } = await supabase
      .from("businesses")
      .select("id")
      .eq("organization_id", resolvedOrgId)
      .limit(1)
      .maybeSingle();

    let businessId: string;
    if (existingBiz) {
      businessId = existingBiz.id;
      await supabase
        .from("businesses")
        .update({
          name: name ? String(name).trim() : undefined,
          tagline: tagline ? String(tagline).trim() : undefined,
          phone: phone ? String(phone).trim() : undefined,
          email: email ? String(email).trim() : undefined,
          website: website ? String(website).trim() : undefined,
          address_line1: address ? String(address).trim() : undefined,
          city: city ? String(city).trim() : undefined,
          business_hours: hours ? { general: String(hours).trim(), timezone: "Asia/Kolkata" } : undefined,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", businessId);
    } else {
      const { data: newBiz, error: bErr } = await supabase
        .from("businesses")
        .insert({
          organization_id: resolvedOrgId,
          name: name ? String(name).trim() : "VoiceNexus Business",
          tagline: tagline ? String(tagline).trim() : "Enterprise AI Solutions",
          phone: phone ? String(phone).trim() : "+91 98401 23456",
          city: city ? String(city).trim() : "Chennai",
          country: "India",
          business_hours: { general: hours ? String(hours).trim() : "09:00 AM - 07:00 PM IST", timezone: "Asia/Kolkata" },
        } as never)
        .select("id")
        .single();

      if (bErr || !newBiz) {
        return NextResponse.json({ success: false, error: bErr?.message || "Failed to create business" }, { status: 500 });
      }
      businessId = newBiz.id;
    }

    // Upsert business_pages
    const cleanSlug = (slug || "kaveri-solar-construction").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const { data: existingPage } = await supabase
      .from("business_pages")
      .select("id, theme_config")
      .eq("business_id", businessId)
      .limit(1)
      .maybeSingle();

    const existingThemeConfig = ((existingPage?.theme_config as Record<string, unknown>) || {});
    const cleanUrl = (url: unknown) => {
      if (typeof url !== "string") return undefined;
      const trimmed = url.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const links = (socialLinks && typeof socialLinks === "object" ? socialLinks : {}) as Record<string, unknown>;

    const themeConfig = {
      ...existingThemeConfig,
      accentColor: "#F97316",
      themePreset: existingThemeConfig.themePreset || "warm-saffron",
      whatsapp: cleanUrl(whatsapp ?? links.whatsapp),
      instagram: cleanUrl(instagram ?? links.instagram),
      facebook: cleanUrl(facebook ?? links.facebook),
      telegram: cleanUrl(telegram ?? links.telegram),
      twitter: cleanUrl(twitter ?? links.twitter),
      snapchat: cleanUrl(snapchat ?? links.snapchat),
      youtube: cleanUrl(youtube ?? links.youtube),
      linkedin: cleanUrl(linkedin ?? links.linkedin),
      threads: cleanUrl(threads ?? links.threads),
      pinterest: cleanUrl(pinterest ?? links.pinterest),
      tiktok: cleanUrl(tiktok ?? links.tiktok),
      github: cleanUrl(github ?? links.github),
      discord: cleanUrl(discord ?? links.discord),
      contactPhone: cleanUrl(phone) || existingThemeConfig.contactPhone || "+91 6382868845",
    };

    if (existingPage) {
      await supabase
        .from("business_pages")
        .update({
          slug: cleanSlug,
          published: Boolean(published),
          hero_headline: headline || "Slash Your Electricity Bills by up to 85% with High-Yield Solar",
          hero_subheadline: subheadline || "Tier-1 bifacial panels, 25-year performance warranty, and subsidy assistance.",
          theme_config: themeConfig,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", existingPage.id);
    } else {
      await supabase.from("business_pages").insert({
        business_id: businessId,
        slug: cleanSlug,
        title: name || "VoiceNexus Business",
        hero_headline: headline || "Slash Your Electricity Bills by up to 85% with High-Yield Solar",
        hero_subheadline: subheadline || "Tier-1 bifacial panels, 25-year performance warranty, and subsidy assistance.",
        published: Boolean(published),
        theme_config: themeConfig,
      } as never);
    }

    // Insert new product if provided
    if (newProduct && typeof newProduct === "object" && newProduct.name) {
      await supabase.from("products").insert({
        business_id: businessId,
        name: String(newProduct.name).trim(),
        description: newProduct.desc ? String(newProduct.desc).trim() : null,
        price_display: newProduct.price ? String(newProduct.price).trim() : null,
        currency: "INR",
        is_active: true,
      } as never);
    }

    return NextResponse.json({
      success: true,
      businessId,
      slug: cleanSlug,
      published: Boolean(published),
      message: "Business profile and public page updated successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

