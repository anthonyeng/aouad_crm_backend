// src/routes/listings.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { auth } = require("../middlewares/auth");
const { requireRole } = require("../middlewares/requireRole");

/* =========================
   Helpers
========================= */
const toIntOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
};

const toFloatOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
};

/* =========================
   Validation Schemas
   - accept numbers OR numeric strings (because forms)
========================= */
const numIntOptional = z.union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? (v.trim() === "" ? null : Number(v)) : v))
  .refine((v) => v == null || Number.isFinite(v), "Must be a number")
  .transform((v) => (v == null ? null : Math.trunc(v)))
  .nullable()
  .optional();

const numFloatOptional = z.union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? (v.trim() === "" ? null : Number(v)) : v))
  .refine((v) => v == null || Number.isFinite(v), "Must be a number")
  .nullable()
  .optional();

/* =========================
   Create / Update Schemas
========================= */
const createListingSchema = z.object({
  title: z.string().min(2),

  // country slug used by /listings?country=dubai
  country: z.string().trim().min(1).optional().nullable(),

  // ✅ Map location
  latitude: numFloatOptional.refine((v) => v == null || (v >= -90 && v <= 90), "Latitude must be between -90 and 90"),
  longitude: numFloatOptional.refine((v) => v == null || (v >= -180 && v <= 180), "Longitude must be between -180 and 180"),
  addressText: z.string().max(200).nullable().optional(),

  // CRM core (required in your DB model)
  propertyType: z.enum(["APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE", "LAND"]),
  category: z.enum(["OFF_PLAN", "READY", "SECONDARY"]),
  status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "OFF_MARKET"]).optional(),

  city: z.string().min(2),
  area: z.string().min(2),
  projectName: z.string().nullable().optional(),

  price: numIntOptional,
  paymentPlan: z.string().nullable().optional(),
  sizeSqft: numIntOptional,
  sizeSqm: numIntOptional,
  bedrooms: numIntOptional,
  bathrooms: numIntOptional,
  parking: numIntOptional,
  view: z.string().nullable().optional(),

  ownerName: z.string().nullable().optional(),
  ownerType: z.string().nullable().optional(),
  listingSource: z.string().nullable().optional(),

  /* ===== WEBSITE FIELDS ===== */
  listingType: z.enum(["OFF_PLAN", "FOR_SALE", "FOR_RENT"]),
  featured: z.boolean().optional(),
  isHidden: z.boolean().optional(),

  completionYear: numIntOptional,
  developerName: z.string().nullable().optional(),
  community: z.string().nullable().optional(),
  locationLabel: z.string().nullable().optional(),

  startingPrice: numIntOptional,
  currency: z.enum(["USD", "AED", "EUR"]).optional(),
  description: z.string().nullable().optional(),

  assignedAgentId: z.string().nullable().optional(), // admin only
});

const updateListingSchema = createListingSchema.partial();

/* =========================
   Create Listing
========================= */
router.post("/", auth, async (req, res) => {
  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid body",
      details: parsed.error.flatten(),
    });
  }

  const data = parsed.data;

  const assignedAgentId =
    req.user.role === "ADMIN" ? data.assignedAgentId ?? null : null;

  try {
    const listing = await prisma.listing.create({
      data: {
        title: data.title,

        country: data.country ? String(data.country).toLowerCase() : null,

        // ✅ Map
        latitude: toFloatOrNull(data.latitude),
        longitude: toFloatOrNull(data.longitude),
        addressText: data.addressText ?? null,

        propertyType: data.propertyType,
        category: data.category,
        status: data.status ?? "AVAILABLE",

        city: data.city,
        area: data.area,
        projectName: data.projectName ?? null,

        price: toIntOrNull(data.price),
        paymentPlan: data.paymentPlan ?? null,
        sizeSqft: toIntOrNull(data.sizeSqft),
        sizeSqm: toIntOrNull(data.sizeSqm),
        bedrooms: toIntOrNull(data.bedrooms),
        bathrooms: toIntOrNull(data.bathrooms),
        parking: toIntOrNull(data.parking),
        view: data.view ?? null,

        ownerName: data.ownerName ?? null,
        ownerType: data.ownerType ?? null,
        listingSource: data.listingSource ?? null,

        listingType: data.listingType,
        featured: data.featured ?? false,
        isHidden: data.isHidden ?? false,

        completionYear: toIntOrNull(data.completionYear),
        developerName: data.developerName ?? null,
        community: data.community ?? null,
        locationLabel: data.locationLabel ?? null,

        startingPrice: toIntOrNull(data.startingPrice),
        currency: data.currency ?? "USD",
        description: data.description ?? null,

        createdById: req.user.sub,
        assignedAgentId,
      },
      include: {
        images: { orderBy: { order: "asc" } },
        assignedAgent: true,
      },
    });

    res.json(listing);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create listing" });
  }
});

/* =========================
   List Listings (admin/agent dashboard)
========================= */
router.get("/", auth, async (req, res) => {
  const qSchema = z.object({
    listingType: z.enum(["OFF_PLAN", "FOR_SALE", "FOR_RENT"]).optional(),
    featured: z.enum(["true", "false"]).optional(),
    limit: z.string().optional(),
    includeHidden: z.enum(["true", "false"]).optional(),
    country: z.string().trim().min(1).optional(),
  });

  const parsed = qSchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.flatten() });
  }

  const { listingType, featured, limit, includeHidden, country } = parsed.data;

  const baseWhere =
    req.user.role === "ADMIN"
      ? {}
      : { OR: [{ createdById: req.user.sub }, { assignedAgentId: req.user.sub }] };

  const countryKey = country ? String(country).toLowerCase() : null;

  const where = {
    ...baseWhere,
    deletedAt: null,
    ...(includeHidden === "true" ? {} : { isHidden: false }),
    ...(listingType ? { listingType } : {}),
    ...(featured ? { featured: featured === "true" } : {}),
    ...(countryKey ? { country: { equals: countryKey } } : {}),
  };

  const take = limit ? Math.max(1, Math.min(50, Number(limit))) : undefined;

  try {
    const listings = await prisma.listing.findMany({
      where,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        images: { orderBy: { order: "asc" } },
        assignedAgent: true,
      },
    });

    res.json({ items: listings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load listings" });
  }
});

/* =========================
   Update Listing
========================= */
router.patch("/:id", auth, async (req, res) => {
  const { id } = req.params;

  const parsed = updateListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid body",
      details: parsed.error.flatten(),
    });
  }

  const existing = await prisma.listing.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Listing not found" });

  const canEdit =
    req.user.role === "ADMIN" ||
    existing.createdById === req.user.sub ||
    existing.assignedAgentId === req.user.sub;

  if (!canEdit) return res.status(403).json({ error: "Forbidden" });

  const incoming = { ...parsed.data };

  // Non-admins cannot change sensitive website/admin fields
  if (req.user.role !== "ADMIN") {
    delete incoming.assignedAgentId;
    delete incoming.featured;
    delete incoming.isHidden;
    delete incoming.deletedAt;
  }

  // Normalize country if present
  if ("country" in incoming) {
    incoming.country = incoming.country ? String(incoming.country).toLowerCase() : null;
  }

  // Convert numeric fields safely (because partial() may pass undefined)
  if ("latitude" in incoming) incoming.latitude = toFloatOrNull(incoming.latitude);
  if ("longitude" in incoming) incoming.longitude = toFloatOrNull(incoming.longitude);
  if ("price" in incoming) incoming.price = toIntOrNull(incoming.price);
  if ("startingPrice" in incoming) incoming.startingPrice = toIntOrNull(incoming.startingPrice);
  if ("completionYear" in incoming) incoming.completionYear = toIntOrNull(incoming.completionYear);
  if ("sizeSqft" in incoming) incoming.sizeSqft = toIntOrNull(incoming.sizeSqft);
  if ("sizeSqm" in incoming) incoming.sizeSqm = toIntOrNull(incoming.sizeSqm);
  if ("bedrooms" in incoming) incoming.bedrooms = toIntOrNull(incoming.bedrooms);
  if ("bathrooms" in incoming) incoming.bathrooms = toIntOrNull(incoming.bathrooms);
  if ("parking" in incoming) incoming.parking = toIntOrNull(incoming.parking);

  try {
    const updated = await prisma.listing.update({
      where: { id },
      data: incoming,
      include: {
        images: { orderBy: { order: "asc" } },
        assignedAgent: true,
      },
    });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update listing" });
  }
});

/* =========================
   Hide / Unhide
========================= */
router.post("/:id/hide", auth, requireRole("ADMIN"), async (req, res) => {
  const updated = await prisma.listing.update({
    where: { id: req.params.id },
    data: { isHidden: true },
  });
  res.json(updated);
});

router.post("/:id/unhide", auth, requireRole("ADMIN"), async (req, res) => {
  const updated = await prisma.listing.update({
    where: { id: req.params.id },
    data: { isHidden: false },
  });
  res.json(updated);
});

/* =========================
   Soft Delete
========================= */
router.delete("/:id", auth, requireRole("ADMIN"), async (req, res) => {
  await prisma.listing.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  res.json({ success: true });
});

module.exports = router;
