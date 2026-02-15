// src/routes/admin.clients.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");

// ✅ robust import: supports auth.js exporting `auth` directly OR { auth }
const authMod = require("../middlewares/auth");
const auth = typeof authMod === "function" ? authMod : authMod.auth;

const { requireRole } = require("../middlewares/requireRole");

if (typeof auth !== "function") {
    throw new Error(
        "Auth middleware is not a function. Check src/middlewares/auth.js exports."
    );
}
if (typeof requireRole !== "function") {
    throw new Error(
        "requireRole is not a function. Check src/middlewares/requireRole.js exports."
    );
}

// Enums aligned with Prisma schema
const ClientType = ["LEAD", "CLIENT", "INVESTOR", "OWNER"];
const Urgency = ["HOT", "WARM", "COLD"];
const ClientStatus = ["OPEN", "FOLLOW_UP", "CLOSED"];

const SOURCES = [
    "INSTAGRAM",
    "PERSONAL_PR",
    "COLD_CALL",
    "WEBSITE",
    "REFERRAL",
    "WHATSAPP",
    "WALK_IN",
    "OTHER",
];

const CreateSchema = z.object({
    clientType: z.enum(ClientType).default("LEAD"),
    name: z.string().min(2),
    dateContacted: z.string().optional(),
    source: z.string().default("INSTAGRAM"),
    phone: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    interestedArea: z.string().nullable().optional(),
    budgetMin: z.number().int().nullable().optional(),
    budgetMax: z.number().int().nullable().optional(),
    bedrooms: z.number().int().nullable().optional(), // ✅ if your Prisma has it
    urgency: z.enum(Urgency).default("WARM"),
    status: z.enum(ClientStatus).optional(),
    agentAssignedId: z.string().nullable().optional(),
    projectShared: z.string().nullable().optional(),
    feedback: z.string().nullable().optional(),
});

const UpdateSchema = z.object({
    clientType: z.enum(ClientType).optional(),
    urgency: z.enum(Urgency).optional(),
    status: z.enum(ClientStatus).optional(),

    source: z.string().optional(),
    dateContacted: z.string().optional(),

    phone: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    interestedArea: z.string().nullable().optional(),

    budgetMin: z.number().int().nullable().optional(),
    budgetMax: z.number().int().nullable().optional(),
    bedrooms: z.number().int().nullable().optional(), // ✅ if your Prisma has it

    agentAssignedId: z.string().nullable().optional(),
    projectShared: z.string().nullable().optional(),
    feedback: z.string().nullable().optional(),
});

function parseDateOrNow(s) {
    if (!s) return new Date();
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function normSource(s) {
    const up = String(s || "").toUpperCase();
    return SOURCES.includes(up) ? up : "OTHER";
}

/* =========================
   ADMIN: CLIENTS
   Mount: app.use("/api/admin", routerFile)
   Routes:
   GET   /api/admin/clients
   POST  /api/admin/clients
   PATCH /api/admin/clients/:id   ✅ used by your "Close Deal"
========================= */

// ✅ ADMIN ONLY: GET /api/admin/clients
router.get("/clients", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 200), 500);

        const items = await prisma.client.findMany({
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
                agentAssigned: { select: { id: true, fullName: true } },
                createdBy: { select: { id: true, fullName: true } },
            },
        });

        res.json({ items });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load clients" });
    }
});

// ✅ ADMIN ONLY: POST /api/admin/clients
router.post("/clients", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        const parsed = CreateSchema.parse(req.body);

        const createdById = req.user?.sub;
        if (!createdById)
            return res.status(401).json({ error: "Unauthenticated" });

        const item = await prisma.client.create({
            data: {
                clientType: parsed.clientType,
                name: parsed.name.trim(),
                dateContacted: parseDateOrNow(parsed.dateContacted),
                source: normSource(parsed.source),

                phone: parsed.phone ? String(parsed.phone).trim() : null,
                email: parsed.email ? String(parsed.email).trim() : null,
                interestedArea: parsed.interestedArea
                    ? String(parsed.interestedArea).trim()
                    : null,

                budgetMin: parsed.budgetMin ?? null,
                budgetMax: parsed.budgetMax ?? null,
                bedrooms: parsed.bedrooms ?? null, // ✅ if field exists
                urgency: parsed.urgency,

                status: parsed.status ?? "OPEN",
                agentAssignedId: parsed.agentAssignedId ?? null,
                projectShared: parsed.projectShared
                    ? String(parsed.projectShared).trim()
                    : null,
                feedback: parsed.feedback ? String(parsed.feedback).trim() : null,

                createdById,
            },
            include: {
                agentAssigned: { select: { id: true, fullName: true } },
                createdBy: { select: { id: true, fullName: true } },
            },
        });

        res.json({ item });
    } catch (e) {
        console.error(e);
        if (e?.name === "ZodError") {
            return res
                .status(400)
                .json({ error: e.errors?.[0]?.message || "Invalid payload" });
        }
        res.status(500).json({ error: "Failed to create client" });
    }
});

// ✅ ADMIN ONLY: PATCH /api/admin/clients/:id  (THIS FIXES YOUR 404)
router.patch("/clients/:id", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Missing id" });

        const parsed = UpdateSchema.parse(req.body);

        const data = {};

        // only set fields if provided
        if (parsed.clientType !== undefined) data.clientType = parsed.clientType;
        if (parsed.urgency !== undefined) data.urgency = parsed.urgency;
        if (parsed.status !== undefined) data.status = parsed.status;

        if (parsed.source !== undefined) data.source = normSource(parsed.source);

        if (parsed.dateContacted !== undefined)
            data.dateContacted = parseDateOrNow(parsed.dateContacted);

        if (parsed.phone !== undefined)
            data.phone = parsed.phone ? String(parsed.phone).trim() : null;

        if (parsed.email !== undefined)
            data.email = parsed.email ? String(parsed.email).trim() : null;

        if (parsed.interestedArea !== undefined)
            data.interestedArea = parsed.interestedArea
                ? String(parsed.interestedArea).trim()
                : null;

        if (parsed.budgetMin !== undefined) data.budgetMin = parsed.budgetMin;
        if (parsed.budgetMax !== undefined) data.budgetMax = parsed.budgetMax;
        if (parsed.bedrooms !== undefined) data.bedrooms = parsed.bedrooms;

        if (parsed.agentAssignedId !== undefined)
            data.agentAssignedId = parsed.agentAssignedId;

        if (parsed.projectShared !== undefined)
            data.projectShared = parsed.projectShared
                ? String(parsed.projectShared).trim()
                : null;

        if (parsed.feedback !== undefined)
            data.feedback = parsed.feedback ? String(parsed.feedback).trim() : null;

        const item = await prisma.client.update({
            where: { id },
            data,
            include: {
                agentAssigned: { select: { id: true, fullName: true } },
                createdBy: { select: { id: true, fullName: true } },
            },
        });

        res.json({ item });
    } catch (e) {
        console.error(e);

        if (e?.name === "ZodError") {
            return res
                .status(400)
                .json({ error: e.errors?.[0]?.message || "Invalid payload" });
        }

        // Prisma record not found
        if (e?.code === "P2025") {
            return res.status(404).json({ error: "Client not found" });
        }

        res.status(500).json({ error: "Failed to update client" });
    }
});

module.exports = router;
