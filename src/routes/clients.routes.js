// src/routes/clients.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { auth, requireRole } = require("../middleware/auth");

// Prisma enums (match schema.prisma)
const ClientType = ["LEAD", "CLIENT", "INVESTOR", "OWNER"];
const Urgency = ["HOT", "WARM", "COLD"];
const ClientStatus = ["OPEN", "FOLLOW_UP", "CLOSED"];

const Sources = [
    "INSTAGRAM",
    "PERSONAL_PR",
    "COLD_CALL",
    "WEBSITE",
    "REFERRAL",
    "WHATSAPP",
    "WALK_IN",
    "OTHER",
];

function parseDateOrNow(s) {
    if (!s) return new Date();
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function upperOrNull(s) {
    if (s == null) return null;
    const v = String(s).trim();
    return v ? v.toUpperCase() : null;
}

const CreateSchema = z.object({
    clientType: z.enum(ClientType).default("LEAD"),
    name: z.string().min(2),
    dateContacted: z.string().optional(), // "YYYY-MM-DD" or ISO
    source: z.string().min(1).default("INSTAGRAM"),
    phone: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    interestedArea: z.string().nullable().optional(), // you're storing country here
    budgetMin: z.number().int().nullable().optional(),
    budgetMax: z.number().int().nullable().optional(),
    bedrooms: z.number().int().nullable().optional(), // ✅ if your Prisma has it
    urgency: z.enum(Urgency).default("WARM"),

    status: z.enum(ClientStatus).optional(),
    agentAssignedId: z.string().nullable().optional(),
    projectShared: z.string().nullable().optional(),
    feedback: z.string().nullable().optional(),
});

// allow partial updates
const PatchSchema = z
    .object({
        clientType: z.enum(ClientType).optional(),
        name: z.string().min(2).optional(),
        dateContacted: z.string().optional(),
        source: z.string().min(1).optional(),
        phone: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        interestedArea: z.string().nullable().optional(),
        budgetMin: z.number().int().nullable().optional(),
        budgetMax: z.number().int().nullable().optional(),
        bedrooms: z.number().int().nullable().optional(),
        urgency: z.enum(Urgency).optional(),

        status: z.enum(ClientStatus).optional(),
        agentAssignedId: z.string().nullable().optional(),
        projectShared: z.string().nullable().optional(),
        feedback: z.string().nullable().optional(),
    })
    .strict();

// shared select
const ClientSelect = {
    id: true,
    clientType: true,
    name: true,
    dateContacted: true,
    source: true,
    phone: true,
    email: true,
    interestedArea: true,
    budgetMin: true,
    budgetMax: true,
    bedrooms: true,
    urgency: true,
    status: true,
    projectShared: true,
    feedback: true,
    agentAssignedId: true,
    createdById: true,
    createdAt: true,
    updatedAt: true,
};

/* =========================
   BASE: /api/clients
========================= */

// GET /api/clients?limit=200
router.get("/", auth, requireRole("ADMIN", "AGENT"), async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 200), 500);

        const items = await prisma.client.findMany({
            take: limit,
            orderBy: { createdAt: "desc" },
            select: ClientSelect,
        });

        res.json({ items });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load clients" });
    }
});

// POST /api/clients
router.post("/", auth, requireRole("ADMIN", "AGENT"), async (req, res) => {
    try {
        const parsed = CreateSchema.parse(req.body);

        // enforce known sources
        const src = upperOrNull(parsed.source) || "INSTAGRAM";
        if (!Sources.includes(src)) {
            return res.status(400).json({ error: "Invalid source" });
        }

        const createdById = req.user?.sub; // your JWT payload uses `sub`
        if (!createdById) return res.status(401).json({ error: "Unauthenticated" });

        const item = await prisma.client.create({
            data: {
                clientType: parsed.clientType,
                name: parsed.name.trim(),
                dateContacted: parseDateOrNow(parsed.dateContacted),
                source: src,
                phone: parsed.phone ? String(parsed.phone).trim() : null,
                email: parsed.email ? String(parsed.email).trim() : null,
                interestedArea: parsed.interestedArea ? String(parsed.interestedArea).trim() : null,
                budgetMin: parsed.budgetMin ?? null,
                budgetMax: parsed.budgetMax ?? null,
                bedrooms: parsed.bedrooms ?? null,
                urgency: parsed.urgency,

                status: parsed.status ?? "OPEN",
                agentAssignedId: parsed.agentAssignedId ?? null,
                projectShared: parsed.projectShared ? String(parsed.projectShared).trim() : null,
                feedback: parsed.feedback ? String(parsed.feedback).trim() : null,

                createdById,
            },
            select: ClientSelect,
        });

        res.json({ item });
    } catch (e) {
        console.error(e);
        if (e?.name === "ZodError") {
            return res.status(400).json({ error: e.errors?.[0]?.message || "Invalid payload" });
        }
        res.status(500).json({ error: "Failed to create client" });
    }
});

// PATCH /api/clients/:id  ✅ used for "Close Deal" and edits
router.patch("/:id", auth, requireRole("ADMIN", "AGENT"), async (req, res) => {
    try {
        const id = req.params.id;
        const parsed = PatchSchema.parse(req.body);

        // normalize source if provided
        if (parsed.source != null) {
            const src = upperOrNull(parsed.source);
            if (!src || !Sources.includes(src)) {
                return res.status(400).json({ error: "Invalid source" });
            }
            parsed.source = src;
        }

        // normalize strings
        const data = {
            ...parsed,
            name: parsed.name ? parsed.name.trim() : undefined,
            phone: parsed.phone != null ? (parsed.phone ? String(parsed.phone).trim() : null) : undefined,
            email: parsed.email != null ? (parsed.email ? String(parsed.email).trim() : null) : undefined,
            interestedArea:
                parsed.interestedArea != null
                    ? parsed.interestedArea
                        ? String(parsed.interestedArea).trim()
                        : null
                    : undefined,
            projectShared:
                parsed.projectShared != null
                    ? parsed.projectShared
                        ? String(parsed.projectShared).trim()
                        : null
                    : undefined,
            feedback:
                parsed.feedback != null
                    ? parsed.feedback
                        ? String(parsed.feedback).trim()
                        : null
                    : undefined,
            dateContacted: parsed.dateContacted ? parseDateOrNow(parsed.dateContacted) : undefined,
        };

        const item = await prisma.client.update({
            where: { id },
            data,
            select: ClientSelect,
        });

        res.json({ item });
    } catch (e) {
        console.error(e);

        if (e?.name === "ZodError") {
            return res.status(400).json({ error: e.errors?.[0]?.message || "Invalid payload" });
        }

        // prisma "record not found"
        if (e?.code === "P2025") {
            return res.status(404).json({ error: "Client not found" });
        }

        res.status(500).json({ error: "Failed to update client" });
    }
});

/* =========================
   ADMIN ALIASES (optional)
   If your frontend calls /api/admin/clients
========================= */

// GET /api/admin/clients?limit=200
router.get("/admin/clients", auth, requireRole("ADMIN", "AGENT"), async (req, res) => {
    // simply forward to same handler logic
    req.url = "/"; // hacky but works in Express; better: duplicate code
    return router.handle(req, res);
});

// POST /api/admin/clients
router.post("/admin/clients", auth, requireRole("ADMIN", "AGENT"), async (req, res) => {
    req.url = "/";
    return router.handle(req, res);
});

// PATCH /api/admin/clients/:id
router.patch("/admin/clients/:id", auth, requireRole("ADMIN", "AGENT"), async (req, res) => {
    // reuse PATCH by remapping url
    req.url = `/${req.params.id}`;
    return router.handle(req, res);
});

module.exports = router;
