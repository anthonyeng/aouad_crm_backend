// src/routes/public.developers.routes.js
const router = require("express").Router();
const { prisma } = require("../lib/prisma");

router.get("/developers/featured", async (req, res) => {
    const items = await prisma.developer.findMany({
        where: { isFeatured: true },
        orderBy: [{ featuredOrder: "asc" }, { createdAt: "desc" }],
        select: {
            id: true,
            name: true,
            description: true,
            logoUrl: true,
        },
    });

    res.json({ items });
});

module.exports = router;
