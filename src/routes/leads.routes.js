// src/routes/leads.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { auth, requireRole } = require("../middleware/auth"); // adjust path if different

// If your auth middleware exports differently, use your actual file.
// From earlier in your project, you had auth + requireRole.

const LeadCreateSchema = z.object({
    clientType: z.enum(["LEAD", "CLIENT", "INVESTOR", "OWNER"]).default("LEAD"),
    name: z.string().min(2),
    dateContacted: z.string().optional(), // accept "YYYY-MM-DD" or ISO string
    source: z
        .enum([
            "INSTAGRAM",
            "PERSONAL_PR",
            "COLD_CALL",
            "WEBSITE",
            "REFERRAL",
            "WHATSAPP",
            "WALK_IN",
            "OTHER",
        ])
        .default("INSTAGRAM"),
    phone: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    interestedArea: z.string().nullable().optional(),
    budgetMin: z.number().nullable().optional(),
    budgetMax: z.number().nullable().optional(),
    urgency: z.enum(["HOT", "WARM", "COLD"]).default("WARM"),

    // future fields (only if they exist in Prisma)
    status: z.string().optional(),
    agentAssignedId: z.string().nullable().optional(),
    projectShared: z.string().nullable().optional(),
    feedback: z.string().nullable().optional(),
});

// GET /api/leads?limit=200
router.get(
    "/",
    auth,
    requireRole("ADMIN", "AGENT"),
    async (req, res) => {
        try {
            const limit = Math.min(Number(req.query.limit || 200), 500);

            const items = await prisma.lead.findMany({
                take: limit,
                orderBy: { createdAt: "desc" },
            });

            res.json({ items });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Failed to load leads" });
        }
    }
);

// POST /api/leads
router.post(
    "/",
    auth,
    requireRole("ADMIN", "AGENT"),
    async (req, res) => {
        try {
            const parsed = LeadCreateSchema.parse(req.body);

            // Convert dateContacted to Date if your Prisma field is DateTime
            // If your field is String, remove this conversion.
            const dateContacted = parsed.dateContacted
                ? new Date(parsed.dateContacted)
                : null;

            const item = await prisma.lead.create({
                data: {
                    clientType: parsed.clientType,
                    name: parsed.name,
                    dateContacted: dateContacted ?? undefined,
                    source: parsed.source,
                    phone: parsed.phone ?? null,
                    email: parsed.email ?? null,
                    interestedArea: parsed.interestedArea ?? null,
                    budgetMin: parsed.budgetMin ?? null,
                    budgetMax: parsed.budgetMax ?? null,
                    urgency: parsed.urgency,

                    // only works if these columns exist in Prisma:
                    // status: parsed.status,
                    // agentAssignedId: parsed.agentAssignedId ?? null,
                    // projectShared: parsed.projectShared ?? null,
                    // feedback: parsed.feedback ?? null,
                },
            });

            res.json({ item });
        } catch (e) {
            console.error(e);
            if (e?.name === "ZodError") {
                return res.status(400).json({ error: e.errors?.[0]?.message || "Invalid payload" });
            }
            res.status(500).json({ error: "Failed to create lead" });
        }
    }
);

module.exports = router;
