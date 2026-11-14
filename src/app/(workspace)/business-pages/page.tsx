"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  ExternalLink,
  Building2,
  Edit3,
  Copy,
  Check,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  Trash2,
  Eye,
  EyeOff,
  Instagram,
  Share2,
  MessageCircle,
  Smartphone,
  Monitor,
  Sparkles,
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
import { SUPPORTED_SOCIAL_PLATFORMS, isValidSocialUrl } from "@/lib/social-links";

interface CatalogProduct {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  category?: string | null;
  price_display?: string | null;
  is_active: boolean;
}

const DEFAULT_SOCIAL_LINKS: Record<string, string> = {
  whatsapp: "https://wa.me/916382868845",
  instagram: "https://www.instagram.com/_jaya__surya__/",
  facebook: "",
  telegram: "",
  twitter: "",
  snapchat: "",
  youtube: "",
  linkedin: "",
  threads: "",
  pinterest: "",
  tiktok: "",
  github: "",
  discord: "",
};

export default function BusinessPagesPage() {
  // Business State
  const [businessName, setBusinessName] = useState("Kaveri Solar & Construction");
  const [tagline, setTagline] = useState("Turnkey Solar EPC & Sustainable Engineering Construction");
  const [phone, setPhone] = useState("+91 6382868845");
  const [email, setEmail] = useState("chitrasivakumar280@gmail.com");
  const [city, setCity] = useState("Coimbatore");
  const [hours, setHours] = useState("09:00 AM – 06:30 PM IST");
  const [slug, setSlug] = useState("kaveri-solar-construction");
  const [isPublished, setIsPublished] = useState(true);
  const [heroHeadline, setHeroHeadline] = useState("High-Yield Rooftop Solar & Precision Engineering Construction");
  const [heroSubheadline, setHeroSubheadline] = useState("MNRE-approved solar EPC, PM Surya Ghar subsidy processing, and structural engineering across Tamil Nadu.");
  const [themePreset, setThemePreset] = useState("warm-saffron");

  // 13 Social Platforms State
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(DEFAULT_SOCIAL_LINKS);
  const [editSocialLinks, setEditSocialLinks] = useState<Record<string, string>>(DEFAULT_SOCIAL_LINKS);

  // Preview Mode: Desktop vs Mobile
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  // Products State
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);

  // Modals
  const [isEditBizModalOpen, setIsEditBizModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditProdModalOpen, setIsEditProdModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form state for editing business
  const [editName, setEditName] = useState(businessName);
  const [editTagline, setEditTagline] = useState(tagline);
  const [editPhone, setEditPhone] = useState(phone);
  const [editEmail, setEditEmail] = useState(email);
  const [editCity, setEditCity] = useState(city);
  const [editHours, setEditHours] = useState(hours);
  const [editSlug, setEditSlug] = useState(slug);
  const [editHeadline, setEditHeadline] = useState(heroHeadline);
  const [editSubheadline, setEditSubheadline] = useState(heroSubheadline);

  // Form state for adding product
  const [prodName, setProdName] = useState("");
  const [prodSku, setProdSku] = useState("");
  const [prodCategory, setProdCategory] = useState("Commercial");
  const [prodDesc, setProdDesc] = useState("");
  const [prodPrice, setProdPrice] = useState("");

  // Form state for editing product
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);

  const loadData = useCallback(() => {
    fetch("/api/business")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.business) {
          if (data.business.name) setBusinessName(data.business.name);
          if (data.business.tagline) setTagline(data.business.tagline);
          if (data.business.phone) setPhone(data.business.phone);
          if (data.business.email) setEmail(data.business.email);
          if (data.business.city) setCity(data.business.city);
          if (data.business.business_hours?.monday_friday) setHours(data.business.business_hours.monday_friday);
        }
        if (data?.success && data?.page) {
          if (data.page.slug) setSlug(data.page.slug);
          setIsPublished(Boolean(data.page.published));
          if (data.page.hero_headline) setHeroHeadline(data.page.hero_headline);
          if (data.page.hero_subheadline) setHeroSubheadline(data.page.hero_subheadline);
          const tc = (data.page.theme_config as Record<string, unknown>) || {};
          if (tc.themePreset) setThemePreset(String(tc.themePreset));
          const nextSocial: Record<string, string> = { ...DEFAULT_SOCIAL_LINKS };
          SUPPORTED_SOCIAL_PLATFORMS.forEach((p) => {
            if (typeof tc[p.key] === "string") {
              nextSocial[p.key] = String(tc[p.key]);
            }
          });
          setSocialLinks(nextSocial);
          setEditSocialLinks(nextSocial);
        }
      })
      .catch((err) => console.error("Error loading business data:", err));

    fetch("/api/products?includeInactive=true")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.products)) {
          setCatalogProducts(data.products);
        }
      })
      .catch((err) => console.error("Error loading products:", err));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    toast.success("Public page URL copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = editSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    setBusinessName(editName.trim());
    setTagline(editTagline.trim());
    setPhone(editPhone.trim());
    setEmail(editEmail.trim());
    setCity(editCity.trim());
    setHours(editHours.trim());
    setSlug(cleanSlug);
    setHeroHeadline(editHeadline.trim());
    setHeroSubheadline(editSubheadline.trim());
    setSocialLinks(editSocialLinks);
    setIsEditBizModalOpen(false);

    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          tagline: editTagline.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim(),
          city: editCity.trim(),
          hours: editHours.trim(),
          slug: cleanSlug,
          published: isPublished,
          headline: editHeadline.trim(),
          subheadline: editSubheadline.trim(),
          socialLinks: editSocialLinks,
          whatsapp: editSocialLinks.whatsapp,
          instagram: editSocialLinks.instagram,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Business profile, public page & social handles saved!");
        loadData();
      }
    } catch {
      toast.info("Business profile updated locally.");
    }
  };

  const handleTogglePublish = async () => {
    const next = !isPublished;
    setIsPublished(next);
    if (next) {
      toast.success("Public business page is now LIVE at /p/" + slug);
    } else {
      toast.info("Public business page unpublished (draft mode)");
    }

    try {
      await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessName,
          slug,
          published: next,
        }),
      });
    } catch {
      // Local state preserved
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) {
      toast.error("Please provide a product name");
      return;
    }

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prodName.trim(),
          sku: prodSku.trim() || undefined,
          category: prodCategory,
          description: prodDesc.trim() || undefined,
          priceDisplay: prodPrice.trim() || "Custom Quotation",
          isActive: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Solution "${prodName}" added to catalog!`);
        setIsAddModalOpen(false);
        setProdName("");
        setProdSku("");
        setProdDesc("");
        setProdPrice("");
        loadData();
      } else {
        toast.error(data.error || "Failed to create product");
      }
    } catch {
      toast.error("Network error while creating product");
    }
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingProduct.id,
          name: editingProduct.name,
          sku: editingProduct.sku,
          category: editingProduct.category,
          description: editingProduct.description,
          priceDisplay: editingProduct.price_display,
          isActive: editingProduct.is_active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Product "${editingProduct.name}" updated!`);
        setIsEditProdModalOpen(false);
        setEditingProduct(null);
        loadData();
      } else {
        toast.error(data.error || "Failed to update product");
      }
    } catch {
      toast.error("Failed to update product");
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/products?id=${id}&hard=true`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Solution "${name}" removed from catalog.`);
        loadData();
      } else {
        toast.error(data.error || "Failed to delete product");
      }
    } catch {
      toast.error("Network error deleting product");
    }
  };

  const handleToggleProductActive = async (id: string, currentStatus: boolean, name: string) => {
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          isActive: !currentStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Product "${name}" is now ${!currentStatus ? "visible on public portal" : "hidden"}`);
        loadData();
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Public Page Customizer &amp; Portal
          </h1>
          <p className="text-xs text-slate-500">
            Customize your brand identity, products, contact channels, and view desktop/mobile live previews.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditName(businessName);
              setEditTagline(tagline);
              setEditPhone(phone);
              setEditEmail(email);
              setEditCity(city);
              setEditHours(hours);
              setEditSlug(slug);
              setEditHeadline(heroHeadline);
              setEditSubheadline(heroSubheadline);
              setEditSocialLinks({ ...socialLinks });
              setIsEditBizModalOpen(true);
            }}
            className="text-xs gap-1.5 h-9 border-slate-200 bg-white hover:bg-slate-50 text-slate-800 shadow-xs font-semibold"
          >
            <Edit3 className="h-3.5 w-3.5 text-orange-600" />
            Customize Page &amp; Brand
          </Button>

          <Button
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white text-xs gap-1.5 h-9 font-semibold shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Solution / Package
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Customizer Controls (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          <Card className="p-5 space-y-4 rounded-2xl border-slate-200/80 bg-white shadow-xs">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 ring-1 ring-orange-200">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{businessName}</h3>
                  <p className="text-xs text-slate-500">{tagline}</p>
                </div>
              </div>
            </div>

            {/* Business Contact Points */}
            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" /> City / Location:
                </span>
                <span className="font-medium text-slate-900">{city}, Tamil Nadu</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" /> Contact Hotline:
                </span>
                <span className="font-mono text-slate-900 font-medium">{phone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp:
                </span>
                <a href={socialLinks.whatsapp || "https://wa.me/916382868845"} target="_blank" rel="noopener noreferrer" className="font-mono text-emerald-700 hover:underline truncate max-w-[180px]">
                  +91 6382868845
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Instagram className="h-3.5 w-3.5 text-rose-500" /> Instagram:
                </span>
                <a href={socialLinks.instagram || "https://www.instagram.com/_jaya__surya__/"} target="_blank" rel="noopener noreferrer" className="font-mono text-rose-600 hover:underline truncate max-w-[180px]">
                  _jaya__surya__
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Share2 className="h-3.5 w-3.5 text-slate-400" /> Active Channels:
                </span>
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md ring-1 ring-emerald-200">
                  {SUPPORTED_SOCIAL_PLATFORMS.filter(p => isValidSocialUrl(socialLinks[p.key])).length} Platforms Configured
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Business Hours:
                </span>
                <span className="text-slate-600 font-medium">{hours}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Brand Palette:
                </span>
                <span className="text-[11px] font-semibold text-amber-800 capitalize bg-amber-50 px-2 py-0.5 rounded-md ring-1 ring-amber-200">
                  {themePreset.replace("-", " ")}
                </span>
              </div>
            </div>

            {/* Public Page Publishing & Link Card */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Public Portal Status:</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    isPublished
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                  }`}
                >
                  <ShieldCheck className="h-3 w-3" /> {isPublished ? "PUBLISHED (LIVE)" : "DRAFT MODE"}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTogglePublish}
                  className="flex-1 text-xs h-8 border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold"
                >
                  {isPublished ? "Unpublish" : "Publish Live"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="text-xs h-8 px-2.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-800"
                  title="Copy Link"
                >
                  {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>

                <Link href={`/p/${slug}`} target="_blank" rel="noopener noreferrer">
                  <Button
                    size="sm"
                    className="text-xs h-8 px-2.5 bg-orange-600 hover:bg-orange-700 text-white shadow-xs"
                    title="Open Live Public Page"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          {/* Solutions & Packages in Catalog */}
          <Card className="p-5 rounded-2xl border-slate-200/80 bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">Configured Products ({catalogProducts.length})</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddModalOpen(true)}
                className="text-xs h-7 gap-1 border-orange-200 text-orange-600 hover:bg-orange-50"
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>

            <div className="space-y-2.5">
              {catalogProducts.map((prod) => (
                <div
                  key={prod.id}
                  className={`rounded-xl border p-3 flex items-center justify-between gap-3 text-xs ${
                    prod.is_active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-60"
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-bold text-slate-900 block truncate">{prod.name}</span>
                    <span className="text-[11px] text-emerald-700 font-semibold">{prod.price_display}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleProductActive(prod.id, prod.is_active, prod.name)}
                      className="p-1 text-slate-400 hover:text-slate-800"
                      title={prod.is_active ? "Hide from public portal" : "Show on portal"}
                    >
                      {prod.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(prod);
                        setIsEditProdModalOpen(true);
                      }}
                      className="p-1 text-slate-400 hover:text-orange-600"
                      title="Edit"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(prod.id, prod.name)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Live Interactive Desktop/Mobile Preview (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <Card className="p-4 rounded-2xl border-slate-200/80 bg-white shadow-xs">
            {/* Preview Controls Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">Live Preview</span>
                <span className="font-mono text-[11px] text-slate-400">/p/{slug}</span>
              </div>

              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setPreviewMode("desktop")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    previewMode === "desktop" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("mobile")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    previewMode === "mobile" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            {/* Embedded Live Preview Frame */}
            <div className="flex justify-center bg-slate-100/70 p-4 rounded-2xl border border-slate-200 overflow-hidden min-h-[580px]">
              <div
                className={`transition-all duration-300 overflow-hidden bg-white shadow-xl ${
                  previewMode === "mobile"
                    ? "w-[375px] h-[660px] rounded-[36px] border-[8px] border-slate-800 ring-2 ring-slate-900/10"
                    : "w-full h-[660px] rounded-2xl border border-slate-200"
                }`}
              >
                <iframe
                  src={`/p/${slug}`}
                  title="Public Page Live Preview"
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Business Profile Modal */}
      <Dialog open={isEditBizModalOpen} onOpenChange={setIsEditBizModalOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-xl p-6">
          <form onSubmit={handleSaveBusiness} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">Edit Business Identity &amp; Content</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update your verified brand name, headlines, contact phone, and Instagram handle.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Company / Brand Name *</label>
                <Input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-xs bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Tagline / Sub-heading *</label>
                <Input
                  required
                  value={editTagline}
                  onChange={(e) => setEditTagline(e.target.value)}
                  className="text-xs bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Public Portal URL Slug (/p/...) *</label>
                  <Input
                    required
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    className="text-xs font-mono bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Hotline Phone *</label>
                  <Input
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="text-xs font-mono bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">City / District *</label>
                  <Input
                    required
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Official Contact Email *</label>
                  <Input
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="text-xs bg-white font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Hero Main Headline *</label>
                <Input
                  required
                  value={editHeadline}
                  onChange={(e) => setEditHeadline(e.target.value)}
                  className="text-xs bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Hero Subheadline</label>
                <textarea
                  rows={2}
                  value={editSubheadline}
                  onChange={(e) => setEditSubheadline(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Social Media Configuration: 13 Supported Platforms */}
              <div className="pt-3 border-t border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Social Media &amp; Communication Channels (13 Platforms)</h4>
                    <p className="text-[11px] text-slate-500">
                      Configure your verified brand profiles. Empty platforms will not render public buttons.
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md ring-1 ring-emerald-200">
                    {SUPPORTED_SOCIAL_PLATFORMS.filter(p => isValidSocialUrl(editSocialLinks[p.key])).length} Active
                  </span>
                </div>

                <div className="max-h-[260px] overflow-y-auto space-y-2.5 pr-1">
                  {SUPPORTED_SOCIAL_PLATFORMS.map((platform) => {
                    const val = editSocialLinks[platform.key] || "";
                    const isValid = isValidSocialUrl(val);
                    const isConfigured = val.trim().length > 0;

                    return (
                      <div key={platform.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-slate-800 flex items-center gap-1.5">
                            {platform.name}
                          </label>
                          <span className={`text-[10px] font-bold px-2 py-0.2 rounded ${
                            isValid
                              ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                              : isConfigured
                              ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300"
                              : "bg-slate-200 text-slate-600"
                          }`}>
                            {isValid ? "Active" : isConfigured ? "Invalid URL" : "Not Configured (Hidden)"}
                          </span>
                        </div>
                        <Input
                          value={val}
                          placeholder={platform.placeholder}
                          onChange={(e) => {
                            const updated = { ...editSocialLinks, [platform.key]: e.target.value };
                            setEditSocialLinks(updated);
                          }}
                          className="h-8 text-xs font-mono bg-white"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Live Social Buttons Preview in Modal */}
                <div className="rounded-xl border border-slate-200 bg-slate-100/80 p-3 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                    Live Public Button Preview:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {SUPPORTED_SOCIAL_PLATFORMS.map((p) => {
                      const url = editSocialLinks[p.key];
                      if (!isValidSocialUrl(url)) return null;

                      return (
                        <span
                          key={p.key}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 shadow-xs ${p.badgeBg} ${p.badgeText} ${p.badgeRing}`}
                        >
                          {p.name}
                        </span>
                      );
                    })}
                    {SUPPORTED_SOCIAL_PLATFORMS.every(p => !isValidSocialUrl(editSocialLinks[p.key])) && (
                      <span className="text-xs text-slate-500 italic">No social platforms configured.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditBizModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Product Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[460px] bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-xl p-6">
          <form onSubmit={handleAddProduct} className="space-y-3.5">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">Add Solution / Offering</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                This offering will display on your public portal for visitors to enquire about.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Solution Name *</label>
                <Input
                  required
                  placeholder="e.g. 10kW Commercial Rooftop System"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Category</label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-900 font-medium"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Services">Services / Advisory</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Display Price</label>
                  <Input
                    placeholder="e.g. ₹5,40,000 Turnkey"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Description</label>
                <textarea
                  rows={3}
                  placeholder="Technical specifications, warranty, or subsidy benefits..."
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs"
              >
                Add Offering
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Edit Product Modal */}
      <Dialog open={isEditProdModalOpen} onOpenChange={setIsEditProdModalOpen}>
        <DialogContent className="sm:max-w-[460px] bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-xl p-6">
          {editingProduct && (
            <form onSubmit={handleSaveEditProduct} className="space-y-3.5">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-slate-900">Edit Offering</DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Update title, display price, category, and technical details.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Solution Name *</label>
                  <Input
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Category</label>
                    <Input
                      value={editingProduct.category || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Display Price</label>
                    <Input
                      value={editingProduct.price_display || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, price_display: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Description</label>
                  <textarea
                    rows={3}
                    value={editingProduct.description || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditProdModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs"
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
