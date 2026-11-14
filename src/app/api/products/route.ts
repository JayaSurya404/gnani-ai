import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/actions/organization";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    let organizationId = searchParams.get("organizationId");
    const includeInactive = searchParams.get("includeInactive") === "true";

    if (!businessId && !organizationId) {
      organizationId = await getActiveOrganizationId();
    }

    if (!businessId && !organizationId) {
      console.warn("[/api/products] No active organization found for session");
      return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
    }

    let query = supabase.from("products").select("*").order("created_at", { ascending: true });

    if (businessId) {
      query = query.eq("business_id", businessId);
    } else if (organizationId) {
      // Find business for organization
      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1)
        .maybeSingle();
      if (biz) {
        query = query.eq("business_id", biz.id);
      } else {
        console.warn(`[/api/products] No business record found for organization ${organizationId}`);
        return NextResponse.json({ success: false, error: "Business profile not found." }, { status: 404 });
      }
    }

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data: products, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
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
      businessId,
      organizationId,
      name,
      sku,
      description,
      category = "Turnkey Package",
      priceAmount,
      priceDisplay,
      currency = "INR",
      isActive = true,
    } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Product name is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    let targetBusinessId = businessId;
    if (!targetBusinessId) {
      let resolvedOrgId = organizationId;
      if (!resolvedOrgId) {
        const { data: firstOrg } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
        resolvedOrgId = firstOrg?.id;
      }
      if (resolvedOrgId) {
        const { data: biz } = await supabase
          .from("businesses")
          .select("id")
          .eq("organization_id", resolvedOrgId)
          .limit(1)
          .maybeSingle();
        targetBusinessId = biz?.id;
      }
    }

    if (!targetBusinessId) {
      return NextResponse.json({ success: false, error: "Business ID not found" }, { status: 400 });
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        business_id: targetBusinessId,
        name: name.trim(),
        sku: sku ? String(sku).trim() : null,
        description: description ? String(description).trim() : null,
        category: category ? String(category).trim() : "Turnkey Package",
        price_amount: priceAmount ? Number(priceAmount) : null,
        price_display: priceDisplay ? String(priceDisplay).trim() : priceAmount ? `₹${Number(priceAmount).toLocaleString("en-IN")}` : "Custom Quotation",
        currency,
        is_active: Boolean(isActive),
      } as never)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      product,
      message: "Product created successfully",
    }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.id) {
      return NextResponse.json({ success: false, error: "Product id is required" }, { status: 400 });
    }

    const {
      id,
      name,
      sku,
      description,
      category,
      priceAmount,
      priceDisplay,
      isActive,
    } = body;

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updatePayload.name = String(name).trim();
    if (sku !== undefined) updatePayload.sku = sku ? String(sku).trim() : null;
    if (description !== undefined) updatePayload.description = description ? String(description).trim() : null;
    if (category !== undefined) updatePayload.category = category ? String(category).trim() : null;
    if (priceAmount !== undefined) updatePayload.price_amount = priceAmount ? Number(priceAmount) : null;
    if (priceDisplay !== undefined) updatePayload.price_display = priceDisplay ? String(priceDisplay).trim() : null;
    if (isActive !== undefined) updatePayload.is_active = Boolean(isActive);

    const { data: updatedProduct, error } = await supabase
      .from("products")
      .update(updatePayload as never)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      product: updatedProduct,
      message: "Product updated successfully",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const hardDelete = searchParams.get("hard") === "true";

    if (!id) {
      return NextResponse.json({ success: false, error: "Product id is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    if (hardDelete) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    } else {
      // Soft archive
      const { error } = await supabase
        .from("products")
        .update({ is_active: false, updated_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: hardDelete ? "Product permanently removed" : "Product archived successfully",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

