const router = require("express").Router();
const { z } = require("zod");
const { auth, requireRole } = require("../middlewares/auth");
const { prisma } = require("../lib/prisma");

// 🔒 ADMIN ONLY
router.use(auth, requireRole("ADMIN"));

/* =========================
   ADMIN DASHBOARD
========================= */
router.get("/dashboard", async (req, res) => {
    const totalListings = await prisma.listing.count();
    const totalClients = await prisma.client.count();
    const totalAgents = await prisma.user.count({
        where: { role: "AGENT" },
    });

    res.json({
        totalListings,
        totalClients,
        totalAgents,
    });
});

/* =========================
   ADMIN: LISTING FEATURED ORDER
========================= */

const FeaturedOrderSchema = z.object({
    featuredOrder: z.number().int().min(1),
});

router.patch("/listings/:id/featured-order", async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Missing id" });

        const payload = FeaturedOrderSchema.parse(req.body);

        const item = await prisma.listing.update({
            where: { id },
            data: {
                featured: true,
                featuredOrder: payload.featuredOrder,
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

        if (e?.code === "P2025") {
            return res.status(404).json({ error: "Listing not found" });
        }

        res.status(500).json({ error: "Failed to update listing order" });
    }
});

/* =========================
   ✅ ADMIN: CLIENT STORIES CRUD
   Base: /api/admin/client-stories
========================= */

const StoryCreateSchema = z.object({
    name: z.string().min(2),
    role: z.string().optional().nullable(),
    quote: z.string().min(10),
    imageUrl: z.string().url().optional().nullable(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

const StoryUpdateSchema = StoryCreateSchema.partial();

router.get("/client-stories", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 200), 500);

        const items = await prisma.clientStory.findMany({
            take: limit,
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        });

        res.json({ items });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load client stories" });
    }
});

router.post("/client-stories", async (req, res) => {
    try {
        const payload = StoryCreateSchema.parse(req.body);

        const item = await prisma.clientStory.create({
            data: {
                name: payload.name.trim(),
                role: payload.role ? String(payload.role).trim() : null,
                quote: payload.quote.trim(),
                imageUrl: payload.imageUrl ? String(payload.imageUrl).trim() : null,
                isActive: payload.isActive ?? true,
                sortOrder: payload.sortOrder ?? 0,
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
        res.status(500).json({ error: "Failed to create client story" });
    }
});

router.patch("/client-stories/:id", async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Missing id" });

        const payload = StoryUpdateSchema.parse(req.body);

        const item = await prisma.clientStory.update({
            where: { id },
            data: {
                ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
                ...(payload.role !== undefined
                    ? { role: payload.role ? String(payload.role).trim() : null }
                    : {}),
                ...(payload.quote !== undefined ? { quote: payload.quote.trim() } : {}),
                ...(payload.imageUrl !== undefined
                    ? { imageUrl: payload.imageUrl ? String(payload.imageUrl).trim() : null }
                    : {}),
                ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
                ...(payload.sortOrder !== undefined ? { sortOrder: payload.sortOrder } : {}),
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

        if (e?.code === "P2025") {
            return res.status(404).json({ error: "Client story not found" });
        }

        res.status(500).json({ error: "Failed to update client story" });
    }
});

router.delete("/client-stories/:id", async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "Missing id" });

        await prisma.clientStory.delete({ where: { id } });
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        if (e?.code === "P2025") {
            return res.status(404).json({ error: "Client story not found" });
        }
        res.status(500).json({ error: "Failed to delete client story" });
    }
});

module.exports = router;