const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { sendExhibitionConfirmation } = require("../lib/mailer");

/* =========================
   GET exhibition by slug (public)
========================= */
router.get("/exhibitions/:slug", async (req, res) => {
  try {
    const exhibition = await prisma.exhibition.findUnique({
      where: { slug: req.params.slug },
      include: {
        bookings: {
          where: { status: { not: "CANCELLED" } },
          select: { day: true, timeSlot: true },
        },
      },
    });

    if (!exhibition || !exhibition.isActive) {
      return res.status(404).json({ error: "Exhibition not found" });
    }

    // Count bookings per day+slot so frontend can show availability
    const slotCounts = {};
    for (const b of exhibition.bookings) {
      const key = `${b.day}|${b.timeSlot}`;
      slotCounts[key] = (slotCounts[key] || 0) + 1;
    }

    res.json({
      exhibition: {
        id: exhibition.id,
        name: exhibition.name,
        slug: exhibition.slug,
        description: exhibition.description,
        day1Date: exhibition.day1Date,
        day2Date: exhibition.day2Date,
        timeSlots: exhibition.timeSlots,
        maxPerSlot: exhibition.maxPerSlot,
      },
      slotCounts,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load exhibition" });
  }
});

/* =========================
   BOOK appointment (public)
========================= */
const BookSchema = z.object({
  day: z.enum(["day1", "day2"]),
  timeSlot: z.string().min(3),
  name: z.string().min(2),
  phone: z.string().min(4),
  email: z.string().email(),
});

router.post("/exhibitions/:slug/book", async (req, res) => {
  try {
    const p = BookSchema.parse(req.body);

    const exhibition = await prisma.exhibition.findUnique({
      where: { slug: req.params.slug },
    });

    if (!exhibition || !exhibition.isActive) {
      return res.status(404).json({ error: "Exhibition not found" });
    }

    // Validate time slot exists
    if (!exhibition.timeSlots.includes(p.timeSlot)) {
      return res.status(400).json({ error: "Invalid time slot" });
    }

    // Check capacity
    const count = await prisma.exhibitionBooking.count({
      where: {
        exhibitionId: exhibition.id,
        day: p.day,
        timeSlot: p.timeSlot,
        status: { not: "CANCELLED" },
      },
    });

    if (count >= exhibition.maxPerSlot) {
      return res.status(409).json({ error: "This time slot is fully booked. Please choose another." });
    }

    // Check duplicate email for same exhibition+day
    const duplicate = await prisma.exhibitionBooking.findFirst({
      where: {
        exhibitionId: exhibition.id,
        email: p.email.toLowerCase().trim(),
        status: { not: "CANCELLED" },
      },
    });

    if (duplicate) {
      return res.status(409).json({ error: "You have already booked an appointment for this exhibition." });
    }

    const booking = await prisma.exhibitionBooking.create({
      data: {
        exhibitionId: exhibition.id,
        day: p.day,
        timeSlot: p.timeSlot,
        name: p.name.trim(),
        phone: p.phone.trim(),
        email: p.email.toLowerCase().trim(),
      },
    });

    // Send confirmation email (non-blocking)
    const dayDate = p.day === "day1" ? exhibition.day1Date : exhibition.day2Date;
    sendExhibitionConfirmation({
      to: booking.email,
      name: booking.name,
      exhibitionName: exhibition.name,
      day: p.day,
      dayDate,
      timeSlot: p.timeSlot,
    }).catch((err) => console.error("[mailer] Failed to send confirmation:", err.message));

    res.json({ booking });
  } catch (e) {
    console.error(e);
    if (e?.name === "ZodError") return res.status(400).json({ error: e.errors?.[0]?.message || "Invalid data" });
    res.status(500).json({ error: "Failed to book appointment" });
  }
});

module.exports = router;
