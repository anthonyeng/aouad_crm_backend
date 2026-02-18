// src/routes/public.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");

/* =========================
   HELPERS
========================= */
const toSqm = (sqft) =>
  typeof sqft === "number" ? Math.round(sqft * 0.092903) : null;

/* =========================
   PUBLIC: AGENTS
========================= */

// GET /api/public/agents
router.get("/agents", async (req, res) => {
  try {
    const agents = await prisma.user.findMany({
      where: { role: "AGENT", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        slug: true,
        title: true,
        bio: true,
        languages: true,
        photoUrl: true,
        hero: true,
        email: true,
        phone: true,
      },
    });

    res.json({ items: agents });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load agents" });
  }
});

// GET /api/public/agents/:slug
router.get("/agents/:slug", async (req, res) => {
  try {
    const agent = await prisma.user.findFirst({
      where: { role: "AGENT", isActive: true, slug: req.params.slug },
      select: {
        id: true,
        fullName: true,
        slug: true,
        title: true,
        bio: true,
        languages: true,
        photoUrl: true,
        hero: true,
        email: true,
        phone: true,
      },
    });

    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json({ item: agent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load agent" });
  }
});

/* =========================
   PUBLIC: LISTINGS FOR AGENT
========================= */

// GET /api/public/agents/:slug/listings?limit=50&listingType=OFF_PLAN|FOR_SALE|FOR_RENT
router.get("/agents/:slug/listings", async (req, res) => {
  try {
    const qSchema = z.object({
      limit: z.string().optional(),
      listingType: z.enum(["OFF_PLAN", "FOR_SALE", "FOR_RENT"]).optional(),
    });

    const parsed = qSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid query",
        details: parsed.error.flatten(),
      });
    }

    const { limit, listingType } = parsed.data;
    const take = limit ? Math.max(1, Math.min(50, Number(limit))) : 50;

    const listings = await prisma.listing.findMany({
      where: {
        deletedAt: null,
        isHidden: false,
        ...(listingType ? { listingType } : {}),
        assignedAgent: { slug: req.params.slug },
      },
      take,
      orderBy: { createdAt: "desc" },
      include: {
        images: { orderBy: { order: "asc" } },
        assignedAgent: {
          select: {
            id: true,               // ✅ ADD
            fullName: true,
            slug: true,
            phone: true,
            email: true,
            photoUrl: true,
            title: true,
          },
        },
      },
    });

    const items = listings.map((l) => {
      const imgs = l.images || [];
      const cover = imgs.find((i) => i.isCover) || imgs[0] || null;

      return {
        id: l.id,
        title: l.title,
        featured: !!l.featured,
        listingType: l.listingType,

        country: l.country || null,
        locationLabel: l.locationLabel || null,
        location: l.locationLabel || `${l.area}, ${l.city}`,
        paymentPlan: l.paymentPlan || "-",
        developerName: l.developerName || null,
        developer: l.developerName || null,
        completionYear: l.completionYear || null,
        handover: l.completionYear ? `Handover by ${l.completionYear}` : null,

        // ✅ MAP
        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
        addressText: l.addressText ?? null,

        mainImageUrl: cover?.url || null,
        images: imgs.map((i) => ({
          id: i.id,
          url: i.url,
          isCover: !!i.isCover,
          order: i.order,
        })),

        startingPrice: l.startingPrice ?? null,
        currency: l.currency || "USD",

        bedrooms: l.bedrooms ?? null,
        bathrooms: l.bathrooms ?? null,
        parking: l.parking ?? null,
        sizeSqft: l.sizeSqft ?? null,
        sizeSqm: l.sizeSqm ?? toSqm(l.sizeSqft),

        // ✅ ADD assignedAgentId too (nice for frontend)
        assignedAgentId: l.assignedAgentId ?? null,

        agent: l.assignedAgent
          ? {
            id: l.assignedAgent.id, // ✅ ADD
            fullName: l.assignedAgent.fullName,
            slug: l.assignedAgent.slug,
            phone: l.assignedAgent.phone,
            email: l.assignedAgent.email,
            photoUrl: l.assignedAgent.photoUrl,
            title: l.assignedAgent.title,
          }
          : null,
      };
    });

    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load agent listings" });
  }
});

/* =========================
   PUBLIC: LISTINGS
========================= */

// GET /api/public/listings?country=dubai&listingType=OFF_PLAN|FOR_SALE|FOR_RENT&featured=true|false&limit=12
router.get("/listings", async (req, res) => {
  try {
    const qSchema = z.object({
      listingType: z.enum(["OFF_PLAN", "FOR_SALE", "FOR_RENT"]).optional(),
      featured: z.enum(["true", "false"]).optional(),
      limit: z.string().optional(),
      country: z.string().trim().min(1).optional(),
    });

    const parsed = qSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid query",
        details: parsed.error.flatten(),
      });
    }

    const { listingType, featured, limit, country } = parsed.data;
    const take = limit ? Math.max(1, Math.min(50, Number(limit))) : 12;

    const countryKey = country ? String(country).toLowerCase() : null;

    const where = {
      deletedAt: null,
      isHidden: false,
      ...(listingType ? { listingType } : {}),
      ...(featured ? { featured: featured === "true" } : {}),
      ...(countryKey ? { country: { equals: countryKey } } : {}),
    };

    const listings = await prisma.listing.findMany({
      where,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        images: { orderBy: { order: "asc" } },
        assignedAgent: {
          select: {
            id: true,               // ✅ ADD
            fullName: true,
            slug: true,
            phone: true,
            email: true,
            photoUrl: true,
            title: true,
          },
        },
      },
    });

    const items = listings.map((l) => {
      const imgs = l.images || [];
      const cover = imgs.find((i) => i.isCover) || imgs[0] || null;

      return {
        id: l.id,
        title: l.title,
        featured: !!l.featured,
        listingType: l.listingType,

        country: l.country || null,
        location: l.locationLabel || `${l.area}, ${l.city}`,
        paymentPlan: l.paymentPlan || "-",
        developer: l.developerName || null,
        handover: l.completionYear ? `Handover by ${l.completionYear}` : null,

        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
        addressText: l.addressText ?? null,

        mainImageUrl: cover?.url || null,

        priceFrom: l.startingPrice ?? null,
        currency: l.currency || "USD",

        bedrooms: l.bedrooms ?? null,
        bathrooms: l.bathrooms ?? null,
        parking: l.parking ?? null,
        sizeSqft: l.sizeSqft ?? null,
        sizeSqm: l.sizeSqm ?? toSqm(l.sizeSqft),

        // ✅ IMPORTANT: expose agent id + assignedAgentId
        assignedAgentId: l.assignedAgentId ?? null,

        agent: l.assignedAgent
          ? {
            id: l.assignedAgent.id, // ✅ ADD
            fullName: l.assignedAgent.fullName,
            slug: l.assignedAgent.slug,
            phone: l.assignedAgent.phone,
            email: l.assignedAgent.email,
            photoUrl: l.assignedAgent.photoUrl,
            title: l.assignedAgent.title,
          }
          : null,
      };
    });

    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load listings" });
  }
});

// GET /api/public/listings/:id
router.get("/listings/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const listing = await prisma.listing.findFirst({
      where: { id, deletedAt: null, isHidden: false },
      include: {
        images: { orderBy: { order: "asc" } },
        assignedAgent: {
          select: {
            id: true,               // ✅ ADD
            fullName: true,
            slug: true,
            email: true,
            phone: true,
            photoUrl: true,
            title: true,
          },
        },
      },
    });

    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const imgs = listing.images || [];
    const cover = imgs.find((i) => i.isCover) || imgs[0] || null;

    res.json({
      item: {
        id: listing.id,
        title: listing.title,
        featured: !!listing.featured,

        listingType: listing.listingType,
        propertyType: listing.propertyType,
        category: listing.category,

        country: listing.country || null,
        city: listing.city,
        area: listing.area,
        locationLabel: listing.locationLabel,

        developerName: listing.developerName,
        community: listing.community,
        completionYear: listing.completionYear,

        paymentPlan: listing.paymentPlan,
        startingPrice: listing.startingPrice,
        currency: listing.currency,
        description: listing.description,

        latitude: listing.latitude ?? null,
        longitude: listing.longitude ?? null,
        addressText: listing.addressText ?? null,

        bedrooms: listing.bedrooms ?? null,
        bathrooms: listing.bathrooms ?? null,
        parking: listing.parking ?? null,
        sizeSqft: listing.sizeSqft ?? null,
        sizeSqm: listing.sizeSqm ?? toSqm(listing.sizeSqft),

        mainImageUrl: cover?.url || null,
        images: imgs.map((i) => ({
          id: i.id,
          url: i.url,
          isCover: !!i.isCover,
          order: i.order,
        })),

        assignedAgentId: listing.assignedAgentId ?? null,

        agent: listing.assignedAgent
          ? {
            id: listing.assignedAgent.id, // ✅ ADD
            fullName: listing.assignedAgent.fullName,
            slug: listing.assignedAgent.slug,
            email: listing.assignedAgent.email,
            phone: listing.assignedAgent.phone,
            photoUrl: listing.assignedAgent.photoUrl,
            title: listing.assignedAgent.title,
          }
          : null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load listing" });
  }
});

module.exports = router;
