const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");

/* =========================
   HELPERS
========================= */
const toSqm = (sqft) =>
  typeof sqft === "number" ? Math.round(sqft * 0.092903) : null;

/* =========================
   ✅ PUBLIC: LEADS (SCHEDULE CALL)
   POST /api/public/leads/schedule-call
========================= */
const ScheduleCallSchema = z.object({
  listingId: z.string().optional(),
  agentId: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(6),
  note: z.string().optional().or(z.literal("")),
  pageUrl: z.string().optional(),
});

router.post("/leads/schedule-call", async (req, res) => {
  try {
    const parsed = ScheduleCallSchema.parse(req.body);

    let listing = null;
    if (parsed.listingId) {
      listing = await prisma.listing.findUnique({
        where: { id: parsed.listingId },
        select: { id: true, assignedAgentId: true },
      });
      if (!listing) {
        return res.status(404).json({ error: "Listing not found" });
      }
    }

    const assignedAgentId = parsed.agentId || listing?.assignedAgentId || null;

    const lead = await prisma.lead.create({
      data: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email || null,
        phone: parsed.phone,
        note: parsed.note || null,
        source: "WEBSITE",
        status: "NEW",
        listingId: listing?.id || parsed.listingId || null,
        assignedAgentId,
        pageUrl: parsed.pageUrl || null,
        userAgent: req.get("user-agent") || null,
        ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
          .toString()
          .slice(0, 64),
      },
    });

    res.json({ ok: true, leadId: lead.id });
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res
        .status(400)
        .json({ error: err.errors?.[0]?.message || "Invalid payload" });
    }
    res.status(500).json({ error: "Failed to submit lead" });
  }
});

/* =========================
   ✅ PUBLIC: CLIENT STORIES (TESTIMONIALS)
   GET /api/public/client-stories?limit=10
========================= */
router.get("/client-stories", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);

    const items = await prisma.clientStory.findMany({
      where: { isActive: true },
      take: limit,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        role: true,
        quote: true,
        imageUrl: true,
      },
    });

    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load client stories" });
  }
});

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
            id: true,
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

        assignedAgentId: l.assignedAgentId ?? null,

        agent: l.assignedAgent
          ? {
            id: l.assignedAgent.id,
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
            id: true,
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

        assignedAgentId: l.assignedAgentId ?? null,

        agent: l.assignedAgent
          ? {
            id: l.assignedAgent.id,
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
            id: true,
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
            id: listing.assignedAgent.id,
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

/* =========================
   ✅ PUBLIC: SELL REQUESTS
   POST /api/public/sell-request
========================= */
const SellRequestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(6),
  phoneCode: z.string().optional(),
  propertyType: z.string().min(1),
  propertyLocation: z.string().min(1),
  details: z.string().optional().or(z.literal("")),
  pageUrl: z.string().optional(),
});

router.post("/sell-request", async (req, res) => {
  try {
    const parsed = SellRequestSchema.parse(req.body);

    // assign to first active agent (owner) by sortOrder
    const firstAgent = await prisma.user.findFirst({
      where: { role: "AGENT", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { fullName: "asc" }],
      select: { id: true },
    });

    const sellRequest = await prisma.sellRequest.create({
      data: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email || null,
        phone: parsed.phone,
        phoneCode: parsed.phoneCode || "+961",
        propertyType: parsed.propertyType,
        propertyLocation: parsed.propertyLocation,
        details: parsed.details || null,
        status: "NEW",
        assignedAgentId: firstAgent?.id || null,
        pageUrl: parsed.pageUrl || null,
        userAgent: req.get("user-agent") || null,
        ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
          .toString()
          .slice(0, 64),
      },
    });

    res.json({ ok: true, id: sellRequest.id });
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res
        .status(400)
        .json({ error: err.errors?.[0]?.message || "Invalid payload" });
    }
    res.status(500).json({ error: "Failed to submit sell request" });
  }
});

module.exports = router;