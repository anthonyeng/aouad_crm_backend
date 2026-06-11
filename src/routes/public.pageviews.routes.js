const router = require("express").Router();
const { prisma } = require("../lib/prisma");

router.post("/pageview", async (req, res) => {
  try {
    const path = String(req.body.path || "/").slice(0, 500);
    const referrer = req.body.referrer
      ? String(req.body.referrer).slice(0, 500)
      : null;
    const userAgent = req.get("user-agent")?.slice(0, 500) || null;

    const xfwd = req.headers["x-forwarded-for"];
    const ip =
      (Array.isArray(xfwd) ? xfwd[0] : xfwd?.split(",")[0]?.trim()) ||
      req.socket?.remoteAddress ||
      null;

    await prisma.pageView.create({
      data: {
        path,
        referrer,
        userAgent,
        ip: ip?.slice(0, 64) || null,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("pageview error:", e.message);
    res.json({ ok: true });
  }
});

module.exports = router;
