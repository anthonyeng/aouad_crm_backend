// src/routes/agent.routes.js
const router = require("express").Router();
const { z } = require("zod");
const bcrypt = require("bcrypt");
const { prisma } = require("../lib/prisma");

const { auth, requireRole } = require("../middlewares/auth");

// ✅ AGENT ONLY
router.use(auth, requireRole("AGENT"));

/* =========================
   Helpers
========================= */
function agentIdFromReq(req) {
    return req.user?.id; // ✅ normalized by auth middleware
}

/* =========================
   GET /api/agent/dashboard
========================= */
router.get("/dashboard", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const [listings, clients, upcomingAppointments, weekAppointments] =
        await Promise.all([
            prisma.listing.count({ where: { assignedAgentId: agentId } }),
            prisma.client.count({ where: { agentAssignedId: agentId } }),
            prisma.appointment.count({
                where: { agentId, startAt: { gte: new Date() } },
            }),
            prisma.appointment.count({
                where: {
                    agentId,
                    startAt: {
                        gte: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                        lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    },
                },
            }),
        ]);

    res.json({ listings, clients, upcomingAppointments, weekAppointments });
});

/* =========================
   GET /api/agent/clients
========================= */
router.get("/clients", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const clients = await prisma.client.findMany({
        where: { agentAssignedId: agentId },
        orderBy: { createdAt: "desc" },
    });

    res.json(clients);
});

/* =========================
   PATCH /api/agent/clients/:id
========================= */
const PatchClientSchema = z.object({
    status: z.enum(["OPEN", "FOLLOW_UP", "CLOSED"]).optional(),
    feedback: z.string().max(2000).optional().nullable(),
    projectShared: z.string().max(2000).optional().nullable(),
});

router.patch("/clients/:id", async (req, res) => {
    const agentId = agentIdFromReq(req);
    const id = req.params.id;

    const parsed = PatchClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.agentAssignedId !== agentId)
        return res.status(403).json({ error: "Forbidden" });

    const updated = await prisma.client.update({
        where: { id },
        data: parsed.data,
    });

    res.json(updated);
});

/* =========================
   GET /api/agent/listings
   (only own listings)
========================= */
router.get("/listings", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const listings = await prisma.listing.findMany({
        where: { assignedAgentId: agentId },
        include: { images: true },
        orderBy: { createdAt: "desc" },
    });

    res.json({ items: listings });
});

/* =========================
   POST /api/agent/listings
   ✅ Auto-assign + set createdById
========================= */
const CreateListingSchema = z.object({
    title: z.string().min(2).max(180),
    country: z.string().min(2).max(80).default("dubai"),
    city: z.string().min(2).max(120),
    area: z.string().min(2).max(160),

    listingType: z.enum(["OFF_PLAN", "FOR_SALE", "FOR_RENT"]).default("OFF_PLAN"),
    propertyType: z
        .enum(["APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE", "LAND"])
        .default("APARTMENT"),
    category: z.enum(["OFF_PLAN", "READY", "SECONDARY"]).default("OFF_PLAN"),

    featured: z.boolean().optional().default(false),
    isHidden: z.boolean().optional().default(false),

    completionYear: z.number().int().min(1900).max(2100).optional().nullable(),
    developerName: z.string().max(160).optional().nullable(),
    locationLabel: z.string().max(200).optional().nullable(),

    startingPrice: z.number().int().optional().nullable(),
    currency: z.enum(["USD", "AED", "EUR"]).default("USD"),
    paymentPlan: z.string().max(2000).optional().nullable(),
    description: z.string().max(8000).optional().nullable(),

    bedrooms: z.number().int().optional().nullable(),
    bathrooms: z.number().int().optional().nullable(),
    parking: z.number().int().optional().nullable(),
    sizeSqft: z.number().int().optional().nullable(),
    sizeSqm: z.number().int().optional().nullable(),

    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    addressText: z.string().max(300).optional().nullable(),
});

router.post("/listings", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const parsed = CreateListingSchema.safeParse(req.body);
    if (!parsed.success) {
        return res
            .status(400)
            .json({ error: "Invalid body", details: parsed.error.flatten() });
    }

    try {
        // ✅ FORCE assignment + creator, ignore anything sent by the client
        const created = await prisma.listing.create({
            data: {
                ...parsed.data,
                createdById: agentId,
                assignedAgentId: agentId,
            },
        });

        res.json({ id: created.id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to create listing" });
    }
});

/* =========================
   PATCH /api/agent/listings/:id
========================= */
const PatchListingSchema = z.object({
    featured: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "OFF_MARKET"]).optional(),
    startingPrice: z.number().int().optional().nullable(),
    description: z.string().max(8000).optional().nullable(),

    // allow agent to update basic fields too if you want:
    title: z.string().min(2).max(180).optional(),
    city: z.string().min(2).max(120).optional(),
    area: z.string().min(2).max(160).optional(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    addressText: z.string().max(300).optional().nullable(),
});

router.patch("/listings/:id", async (req, res) => {
    const agentId = agentIdFromReq(req);
    const id = req.params.id;

    const parsed = PatchListingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.assignedAgentId !== agentId)
        return res.status(403).json({ error: "Forbidden" });

    // ✅ never allow changing assignedAgentId
    const { assignedAgentId, ...safe } = parsed.data;

    const updated = await prisma.listing.update({
        where: { id },
        data: safe,
    });

    res.json(updated);
});

/* =========================
   GET /api/agent/me
========================= */
router.get("/me", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const me = await prisma.user.findUnique({
        where: { id: agentId },
        select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            languages: true,
            bio: true,
            photoUrl: true,
            slug: true,
            title: true,
            hero: true,
            sortOrder: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    res.json(me);
});

/* =========================
   PATCH /api/agent/me
========================= */
const PatchMeSchema = z.object({
    fullName: z.string().min(2).max(120).optional(),
    phone: z.string().max(40).optional().nullable(),
    languages: z.array(z.string().max(40)).optional(),
    bio: z.string().max(2000).optional().nullable(),
    title: z.string().max(120).optional().nullable(),
});

router.patch("/me", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const parsed = PatchMeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const updated = await prisma.user.update({
        where: { id: agentId },
        data: parsed.data,
        select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            languages: true,
            bio: true,
            title: true,
            updatedAt: true,
        },
    });

    res.json(updated);
});

/* =========================
   POST /api/agent/change-password
========================= */
const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(6),
});

router.post("/change-password", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const user = await prisma.user.findUnique({ where: { id: agentId } });
    if (!user) return res.status(404).json({ error: "Not found" });

    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Wrong password" });

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

    await prisma.user.update({
        where: { id: agentId },
        data: { passwordHash },
    });

    res.json({ ok: true });
});

/* =========================
   SCHEDULE
========================= */
router.get("/schedule", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const rows = await prisma.agentSchedule.findMany({
        where: { agentId },
        orderBy: { dayOfWeek: "asc" },
    });

    res.json(rows);
});

const PutScheduleSchema = z.array(
    z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startHHMM: z.string().regex(/^\d{2}:\d{2}$/),
        endHHMM: z.string().regex(/^\d{2}:\d{2}$/),
        slotMin: z.number().int().min(10).max(240).default(30),
    })
);

router.put("/schedule", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const parsed = PutScheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    await prisma.agentSchedule.deleteMany({ where: { agentId } });

    if (parsed.data.length) {
        await prisma.agentSchedule.createMany({
            data: parsed.data.map((x) => ({ ...x, agentId })),
        });
    }

    res.json({ ok: true });
});

/* =========================
   APPOINTMENTS
========================= */
router.get("/appointments", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const rows = await prisma.appointment.findMany({
        where: { agentId },
        orderBy: { startAt: "asc" },
        take: 50,
    });

    res.json(rows);
});

const CreateAppointmentSchema = z.object({
    startAt: z.string().min(1),
    durationMin: z.number().int().min(15).max(240).default(30),
    customerName: z.string().min(2).max(120),
    customerPhone: z.string().min(3).max(60),
    note: z.string().max(2000).optional().nullable(),
    source: z.string().max(80).optional().nullable(),
});

router.post("/appointments", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const parsed = CreateAppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const startAt = new Date(parsed.data.startAt);
    if (Number.isNaN(startAt.getTime())) {
        return res.status(400).json({ error: "Invalid startAt" });
    }

    const created = await prisma.appointment.create({
        data: {
            agentId,
            startAt,
            durationMin: parsed.data.durationMin,
            customerName: parsed.data.customerName,
            customerPhone: parsed.data.customerPhone,
            note: parsed.data.note || null,
            source: parsed.data.source || "agent_panel",
            status: "CONFIRMED",
        },
    });

    res.json(created);
});

module.exports = router;
