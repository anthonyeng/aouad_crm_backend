// src/routes/agent.routes.js
const router = require("express").Router();
const { z } = require("zod");
const bcrypt = require("bcrypt");
const { prisma } = require("../lib/prisma");

const { auth, requireRole } = require("../middlewares/auth");

// ✅ AGENT ONLY
router.use(auth, requireRole("AGENT"));
function hhmmToMinutes(hhmm) {
    const [h, m] = String(hhmm || "00:00")
        .split(":")
        .map((x) => Number(x || 0));
    return h * 60 + m;
}

function getDayOfWeekLocal(date) {
    return new Date(date).getDay(); // 0..6
}

function getMinutesSinceMidnightLocal(date) {
    const d = new Date(date);
    return d.getHours() * 60 + d.getMinutes();
}

function addMinutes(date, minutes) {
    return new Date(new Date(date).getTime() + minutes * 60 * 1000);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}
function agentIdFromReq(req) {
    return req.user?.id;
}

/* =========================
   DASHBOARD
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
   CLIENTS
========================= */
router.get("/clients", async (req, res) => {
    const agentId = agentIdFromReq(req);

    const clients = await prisma.client.findMany({
        where: { agentAssignedId: agentId },
        orderBy: { createdAt: "desc" },
    });

    res.json(clients);
});

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
   LISTINGS (own)
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

const PatchListingSchema = z.object({
    featured: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "OFF_MARKET"]).optional(),
    startingPrice: z.number().int().optional().nullable(),
    description: z.string().max(8000).optional().nullable(),

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

    const { assignedAgentId, ...safe } = parsed.data;

    const updated = await prisma.listing.update({
        where: { id },
        data: safe,
    });

    res.json(updated);
});

/* =========================
   ME
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
   CHANGE PASSWORD
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
router.put("/schedule", async (req, res) => {
    try {
        const agentId = agentIdFromReq(req);

        const parsed = PutScheduleSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

        const seen = new Set();

        for (const row of parsed.data) {
            if (seen.has(row.dayOfWeek)) {
                return res.status(400).json({ error: "Duplicate weekday in schedule." });
            }
            seen.add(row.dayOfWeek);

            const startMin = hhmmToMinutes(row.startHHMM);
            const endMin = hhmmToMinutes(row.endHHMM);
            const slotMin = Number(row.slotMin) || 30;

            if (endMin <= startMin) {
                return res.status(400).json({
                    error: `End time must be after start time for day ${row.dayOfWeek}.`,
                });
            }

            if ((endMin - startMin) < slotMin) {
                return res.status(400).json({
                    error: `Working hours must be at least one slot for day ${row.dayOfWeek}.`,
                });
            }
        }

        await prisma.agentSchedule.deleteMany({ where: { agentId } });

        if (parsed.data.length) {
            await prisma.agentSchedule.createMany({
                data: parsed.data.map((x) => ({ ...x, agentId })),
            });
        }

        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to save schedule" });
    }
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
    try {
        const agentId = agentIdFromReq(req);

        const parsed = CreateAppointmentSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Invalid body" });
        }

        const startAt = new Date(parsed.data.startAt);
        if (Number.isNaN(startAt.getTime())) {
            return res.status(400).json({ error: "Invalid startAt" });
        }

        const durationMin = Number(parsed.data.durationMin) || 30;
        const endAt = addMinutes(startAt, durationMin);

        const dayOfWeek = getDayOfWeekLocal(startAt);
        const startMin = getMinutesSinceMidnightLocal(startAt);
        const endMin = startMin + durationMin;

        // 1) agent must have schedule for this weekday
        const scheduleRow = await prisma.agentSchedule.findUnique({
            where: {
                agentId_dayOfWeek: {
                    agentId,
                    dayOfWeek,
                },
            },
        });

        if (!scheduleRow) {
            return res.status(400).json({ error: "This day is not available." });
        }

        const scheduleStartMin = hhmmToMinutes(scheduleRow.startHHMM);
        const scheduleEndMin = hhmmToMinutes(scheduleRow.endHHMM);

        // 2) booking must be inside working hours
        if (startMin < scheduleStartMin || endMin > scheduleEndMin) {
            return res.status(400).json({ error: "Appointment is outside available hours." });
        }

        // 3) booking must respect slot size
        const slotMin = Number(scheduleRow.slotMin) || 30;

        if (durationMin !== slotMin) {
            return res.status(400).json({
                error: `Appointment duration must be exactly ${slotMin} minutes for this day.`,
            });
        }

        if ((startMin - scheduleStartMin) % slotMin !== 0) {
            return res.status(400).json({
                error: "Appointment must start on a valid slot boundary.",
            });
        }

        // 4) one user at a time: no overlap with existing active appointments
        const sameDayStart = new Date(startAt);
        sameDayStart.setHours(0, 0, 0, 0);

        const sameDayEnd = new Date(startAt);
        sameDayEnd.setHours(23, 59, 59, 999);

        const existing = await prisma.appointment.findMany({
            where: {
                agentId,
                status: {
                    in: ["PENDING", "CONFIRMED"],
                },
                startAt: {
                    gte: sameDayStart,
                    lte: sameDayEnd,
                },
            },
            orderBy: { startAt: "asc" },
        });

        const conflict = existing.find((appt) => {
            const apptStart = new Date(appt.startAt);
            const apptEnd = addMinutes(apptStart, appt.durationMin || 30);
            return rangesOverlap(startAt, endAt, apptStart, apptEnd);
        });

        if (conflict) {
            return res.status(409).json({ error: "This slot is already booked." });
        }

        const created = await prisma.appointment.create({
            data: {
                agentId,
                startAt,
                durationMin,
                customerName: parsed.data.customerName,
                customerPhone: parsed.data.customerPhone,
                note: parsed.data.note || null,
                source: parsed.data.source || "agent_panel",
                status: "CONFIRMED",
            },
        });

        res.json(created);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to create appointment" });
    }
});
/* =========================
   ✅ LEADS INBOX (MERGED)
   GET /api/agent/leads
   PATCH /api/agent/leads/:id
   DELETE /api/agent/leads/:id
========================= */

// ✅ IMPORTANT: AgentLeadsPage edits ADMIN_LEAD with many fields
// so we must allow them here safely.
const AgentLeadPatchSchema = z.object({
    // schedule-call Lead table
    status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CLOSED", "SPAM"]).optional(),
    note: z.string().max(4000).optional().nullable(),

    // Client table (ADMIN_LEAD)
    clientType: z.enum(["LEAD", "CLIENT", "INVESTOR", "OWNER"]).optional(),
    name: z.string().min(2).max(160).optional(),
    dateContacted: z.string().min(8).optional(), // yyyy-mm-dd
    source: z.string().max(80).optional(),
    phone: z.string().min(3).max(60).optional().nullable(),
    email: z.string().email().optional().or(z.literal("")).nullable(),

    interestedArea: z.string().max(120).optional().nullable(),
    budgetMin: z.number().int().optional().nullable(),
    budgetMax: z.number().int().optional().nullable(),
    bedrooms: z.number().int().optional().nullable(),
    urgency: z.enum(["HOT", "WARM", "COLD"]).optional(),

    // allow old naming too
    clientStatus: z.enum(["OPEN", "FOLLOW_UP", "CLOSED"]).optional(),
    feedback: z.string().max(2000).optional().nullable(),
    projectShared: z.string().max(2000).optional().nullable(),
});

router.get("/leads", async (req, res) => {
    try {
        const agentId = agentIdFromReq(req);
        const limit = Math.min(Number(req.query.limit || 200), 500);

        // 1) Schedule-call leads (Lead table)
        const webLeads = await prisma.lead.findMany({
            where: { assignedAgentId: agentId },
            take: limit,
            orderBy: { createdAt: "desc" },
            include: { listing: { select: { id: true, title: true } } },
        });

        // 2) Admin-assigned items (Client table) — show ALL assigned
        const adminLeads = await prisma.client.findMany({
            where: { agentAssignedId: agentId },
            take: limit,
            orderBy: { createdAt: "desc" },
        });

        const items = [
            ...webLeads.map((x) => ({
                kind: "SCHEDULE_CALL",
                id: x.id,
                createdAt: x.createdAt,
                updatedAt: x.updatedAt,
                firstName: x.firstName,
                lastName: x.lastName,
                email: x.email,
                phone: x.phone,
                note: x.note,
                status: x.status,
                listingId: x.listingId,
                listing: x.listing ? { id: x.listing.id, title: x.listing.title } : null,
            })),
            ...adminLeads.map((x) => ({
                kind: "ADMIN_LEAD",
                id: x.id,
                createdAt: x.createdAt,
                updatedAt: x.updatedAt,

                clientType: x.clientType,
                name: x.name,
                dateContacted: x.dateContacted,

                firstName: (x.name || "").split(" ")[0] || "",
                lastName: (x.name || "").split(" ").slice(1).join(" ") || "",

                email: x.email,
                phone: x.phone,

                source: x.source,
                budgetMin: x.budgetMin ?? null,
                budgetMax: x.budgetMax ?? null,
                bedrooms: x.bedrooms ?? null,

                note: x.projectShared || x.feedback || null,

                status: x.status, // OPEN/FOLLOW_UP/CLOSED
                feedback: x.feedback || null,
                projectShared: x.projectShared || null,
                interestedArea: x.interestedArea || null,
                urgency: x.urgency || null,
            })),
        ];

        items.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        res.json({ items: items.slice(0, limit) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load leads" });
    }
});

router.patch("/leads/:id", async (req, res) => {
    try {
        const agentId = agentIdFromReq(req);
        const id = req.params.id;

        const parsed = AgentLeadPatchSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

        // decide which table this id belongs to
        const web = await prisma.lead.findUnique({ where: { id } });

        // ---------------- schedule-call Lead ----------------
        if (web) {
            if (web.assignedAgentId !== agentId)
                return res.status(403).json({ error: "Forbidden" });

            const updated = await prisma.lead.update({
                where: { id },
                data: {
                    status: parsed.data.status ?? undefined,
                    note: parsed.data.note ?? undefined,
                },
                include: { listing: { select: { id: true, title: true } } },
            });

            return res.json({
                item: {
                    kind: "SCHEDULE_CALL",
                    id: updated.id,
                    createdAt: updated.createdAt,
                    updatedAt: updated.updatedAt,
                    firstName: updated.firstName,
                    lastName: updated.lastName,
                    email: updated.email,
                    phone: updated.phone,
                    note: updated.note,
                    status: updated.status,
                    listingId: updated.listingId,
                    listing: updated.listing
                        ? { id: updated.listing.id, title: updated.listing.title }
                        : null,
                },
            });
        }

        // ---------------- Client (ADMIN_LEAD) ----------------
        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: "Not found" });
        if (client.agentAssignedId !== agentId)
            return res.status(403).json({ error: "Forbidden" });

        // allow status from frontend (OPEN/FOLLOW_UP/CLOSED)
        const bodyStatus = req.body?.status;
        const clientStatusFromBody =
            ["OPEN", "FOLLOW_UP", "CLOSED"].includes(String(bodyStatus || "").toUpperCase())
                ? String(bodyStatus || "").toUpperCase()
                : undefined;

        // dateContacted parse if present
        let dateContacted = undefined;
        if (parsed.data.dateContacted) {
            const d = new Date(parsed.data.dateContacted);
            if (Number.isNaN(d.getTime())) {
                return res.status(400).json({ error: "Invalid dateContacted" });
            }
            dateContacted = d;
        }

        const updatedClient = await prisma.client.update({
            where: { id },
            data: {
                // fields your AgentLeadsPage sends
                clientType: parsed.data.clientType ?? undefined,
                name: parsed.data.name ?? undefined,
                dateContacted: dateContacted ?? undefined,
                source: parsed.data.source ?? undefined,
                phone: parsed.data.phone ?? undefined,
                email:
                    parsed.data.email === "" ? null : parsed.data.email ?? undefined,

                interestedArea: parsed.data.interestedArea ?? undefined,
                budgetMin: parsed.data.budgetMin ?? undefined,
                budgetMax: parsed.data.budgetMax ?? undefined,
                bedrooms: parsed.data.bedrooms ?? undefined,
                urgency: parsed.data.urgency ?? undefined,

                status:
                    parsed.data.clientStatus ??
                    clientStatusFromBody ??
                    undefined,

                feedback: parsed.data.feedback ?? undefined,
                projectShared: parsed.data.projectShared ?? undefined,
            },
        });

        return res.json({
            item: {
                kind: "ADMIN_LEAD",
                id: updatedClient.id,
                createdAt: updatedClient.createdAt,
                updatedAt: updatedClient.updatedAt,

                clientType: updatedClient.clientType,
                name: updatedClient.name,
                dateContacted: updatedClient.dateContacted,

                firstName:
                    (updatedClient.name || "").split(" ")[0] || updatedClient.name || "",
                lastName:
                    (updatedClient.name || "").split(" ").slice(1).join(" ") || "",

                email: updatedClient.email,
                phone: updatedClient.phone,

                source: updatedClient.source,
                budgetMin: updatedClient.budgetMin ?? null,
                budgetMax: updatedClient.budgetMax ?? null,
                bedrooms: updatedClient.bedrooms ?? null,

                note: updatedClient.projectShared || updatedClient.feedback || null,

                status: updatedClient.status,
                feedback: updatedClient.feedback || null,
                projectShared: updatedClient.projectShared || null,
                interestedArea: updatedClient.interestedArea || null,
                urgency: updatedClient.urgency || null,
            },
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to update lead" });
    }
});

router.delete("/leads/:id", async (req, res) => {
    try {
        const agentId = agentIdFromReq(req);
        const id = req.params.id;

        const web = await prisma.lead.findUnique({ where: { id } });
        if (web) {
            if (web.assignedAgentId !== agentId)
                return res.status(403).json({ error: "Forbidden" });
            await prisma.lead.delete({ where: { id } });
            return res.json({ ok: true });
        }

        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) return res.status(404).json({ error: "Not found" });
        if (client.agentAssignedId !== agentId)
            return res.status(403).json({ error: "Forbidden" });

        // ⚠️ If you don't want agents deleting clients, change this to:
        // await prisma.client.update({ where:{id}, data:{ status:"CLOSED" } })
        await prisma.client.delete({ where: { id } });

        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to delete lead" });
    }
});

/* =========================
   ✅ MANUAL CREATE LEAD (Agent)
   POST /api/agent/leads/manual
   Creates a Client row with clientType=LEAD
========================= */
const CreateManualLeadSchema = z.object({
    name: z.string().min(2).max(160),
    dateContacted: z.string().min(8).optional(), // yyyy-mm-dd
    source: z.string().max(80).optional(),
    phone: z.string().min(6).max(60),
    email: z.string().email().optional().or(z.literal("")).nullable(),

    interestedArea: z.string().max(120).optional().nullable(),
    budgetMin: z.number().int().optional().nullable(),
    budgetMax: z.number().int().optional().nullable(),
    bedrooms: z.number().int().optional().nullable(),

    urgency: z.enum(["HOT", "WARM", "COLD"]).optional(),
    status: z.enum(["OPEN", "FOLLOW_UP", "CLOSED"]).optional(),

    projectShared: z.string().max(2000).optional().nullable(),
    feedback: z.string().max(2000).optional().nullable(),

    agentAssignedId: z.string().optional().nullable(),
});

router.post("/leads/manual", async (req, res) => {
    try {
        const agentId = agentIdFromReq(req);

        const parsed = CreateManualLeadSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

        const dStr = parsed.data.dateContacted;
        const dateContacted = dStr ? new Date(dStr) : new Date();
        if (Number.isNaN(dateContacted.getTime())) {
            return res.status(400).json({ error: "Invalid dateContacted" });
        }

        const created = await prisma.client.create({
            data: {
                clientType: "LEAD",
                name: parsed.data.name.trim(),
                dateContacted,

                source: (parsed.data.source || "MANUAL").trim(),
                phone: parsed.data.phone?.trim() || null,
                email: parsed.data.email ? String(parsed.data.email).trim() : null,

                interestedArea: parsed.data.interestedArea?.trim() || null,
                budgetMin: parsed.data.budgetMin ?? null,
                budgetMax: parsed.data.budgetMax ?? null,
                bedrooms: parsed.data.bedrooms ?? null,

                urgency: parsed.data.urgency || "WARM",
                status: parsed.data.status || "OPEN",

                projectShared: parsed.data.projectShared?.trim() || null,
                feedback: parsed.data.feedback?.trim() || null,

                createdById: agentId,
                agentAssignedId: parsed.data.agentAssignedId || agentId,
            },
        });

        res.json({ item: created });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to create lead" });
    }
});
router.get("/schedule", async (req, res) => {
    try {
        const agentId = agentIdFromReq(req);

        const rows = await prisma.agentSchedule.findMany({
            where: { agentId },
            orderBy: { dayOfWeek: "asc" },
        });

        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load schedule" });
    }
});
module.exports = router;