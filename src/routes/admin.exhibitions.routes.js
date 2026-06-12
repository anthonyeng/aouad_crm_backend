const router = require("express").Router();
const { z } = require("zod");
const { auth, requireRole } = require("../middlewares/auth");
const { prisma } = require("../lib/prisma");

router.use(auth, requireRole("ADMIN"));

/* =========================
   HELPER: slug from name
========================= */
function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* =========================
   LIST exhibitions
========================= */
router.get("/exhibitions", async (req, res) => {
  try {
    const items = await prisma.exhibition.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { bookings: true } } },
    });
    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load exhibitions" });
  }
});

/* =========================
   GET single exhibition + bookings
========================= */
router.get("/exhibitions/:id", async (req, res) => {
  try {
    const item = await prisma.exhibition.findUnique({
      where: { id: req.params.id },
      include: {
        bookings: { orderBy: [{ day: "asc" }, { timeSlot: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ item });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load exhibition" });
  }
});

/* =========================
   CREATE exhibition
========================= */
const CreateSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  day1Date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day2Date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlots: z.array(z.string()).optional(),
  maxPerSlot: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

router.post("/exhibitions", async (req, res) => {
  try {
    const p = CreateSchema.parse(req.body);
    let slug = slugify(p.name);

    // ensure unique slug
    const existing = await prisma.exhibition.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const item = await prisma.exhibition.create({
      data: {
        name: p.name.trim(),
        slug,
        description: p.description?.trim() || null,
        day1Date: p.day1Date,
        day2Date: p.day2Date,
        timeSlots: p.timeSlots || undefined,
        maxPerSlot: p.maxPerSlot ?? 5,
        isActive: p.isActive ?? true,
      },
    });
    res.json({ item });
  } catch (e) {
    console.error(e);
    if (e?.name === "ZodError") return res.status(400).json({ error: e.errors?.[0]?.message || "Invalid payload" });
    res.status(500).json({ error: "Failed to create exhibition" });
  }
});

/* =========================
   UPDATE exhibition
========================= */
const UpdateSchema = CreateSchema.partial();

router.patch("/exhibitions/:id", async (req, res) => {
  try {
    const p = UpdateSchema.parse(req.body);
    const data = {};

    if (p.name !== undefined) data.name = p.name.trim();
    if (p.description !== undefined) data.description = p.description?.trim() || null;
    if (p.day1Date !== undefined) data.day1Date = p.day1Date;
    if (p.day2Date !== undefined) data.day2Date = p.day2Date;
    if (p.timeSlots !== undefined) data.timeSlots = p.timeSlots;
    if (p.maxPerSlot !== undefined) data.maxPerSlot = p.maxPerSlot;
    if (p.isActive !== undefined) data.isActive = p.isActive;

    const item = await prisma.exhibition.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ item });
  } catch (e) {
    console.error(e);
    if (e?.name === "ZodError") return res.status(400).json({ error: e.errors?.[0]?.message || "Invalid payload" });
    if (e?.code === "P2025") return res.status(404).json({ error: "Not found" });
    res.status(500).json({ error: "Failed to update exhibition" });
  }
});

/* =========================
   DELETE exhibition
========================= */
router.delete("/exhibitions/:id", async (req, res) => {
  try {
    await prisma.exhibition.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    if (e?.code === "P2025") return res.status(404).json({ error: "Not found" });
    res.status(500).json({ error: "Failed to delete exhibition" });
  }
});

/* =========================
   CANCEL a booking
========================= */
router.patch("/exhibition-bookings/:id/cancel", async (req, res) => {
  try {
    const item = await prisma.exhibitionBooking.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED" },
    });
    res.json({ item });
  } catch (e) {
    console.error(e);
    if (e?.code === "P2025") return res.status(404).json({ error: "Booking not found" });
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

module.exports = router;
