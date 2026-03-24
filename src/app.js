// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const { prisma } = require("./lib/prisma");
const authRoutes = require("./routes/auth.routes");
const listingsRoutes = require("./routes/listings.routes");
const uploadsRoutes = require("./routes/uploads.routes");
const usersRoutes = require("./routes/users.routes");
const publicRoutes = require("./routes/public.routes");

// ✅ LEADS
const leadsRoutes = require("./routes/leads.routes");
const publicLeadsRoutes = require("./routes/public.leads.routes");

// ✅ NEW: public booking (availability + book appointment)
const publicBookingRoutes = require("./routes/public.booking.routes");

// ADMIN routes
const adminClientsRoutes = require("./routes/admin.clients.routes");
const adminDevelopersRoutes = require("./routes/admin.developers.routes");
const adminCareersRoutes = require("./routes/admin.careers.routes");
const adminClientStoriesRoutes = require("./routes/admin.clientStories.routes");

// PUBLIC routes
const publicDevelopersRoutes = require("./routes/public.developers.routes");
const publicCareersRoutes = require("./routes/public.careers.routes");
const publicClientStoriesRoutes = require("./routes/public.clientStories.routes");
const publicListingsRoutes = require("./routes/public.listings.routes");

// AGENT routes
const agentRoutes = require("./routes/agent.routes");

const app = express();

/* =========================
   MIDDLEWARE
========================= */
app.use(helmet());
app.use(
   cors({
      origin: true,
      credentials: true,
   })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));

/* =========================
   HEALTH
========================= */
app.get("/api/health", (req, res) => res.json({ ok: true }));

/* =========================
   STATIC
========================= */
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

/* =========================
   PUBLIC (NO AUTH)
========================= */
// order matters
app.use("/api/public", publicClientStoriesRoutes);
app.use("/api/public", publicDevelopersRoutes);
app.use("/api/public", publicCareersRoutes);
app.use("/api/public", publicListingsRoutes);
app.use("/api/public", publicRoutes);

// ✅ public lead capture (schedule call, forms)
app.use("/api/public", publicLeadsRoutes);

// ✅ public booking (availability + book)
app.use("/api/public", publicBookingRoutes);

/* =========================
   AUTH
========================= */
app.use("/api/auth", authRoutes);

/* =========================
   CORE
========================= */
app.use("/api/listings", listingsRoutes);
app.use("/api/users", usersRoutes);

// ✅ lead management (admin / agent)
app.use("/api/leads", leadsRoutes);

/* =========================
   UPLOADS
========================= */
app.use("/api/uploads", uploadsRoutes);

/* =========================
   ADMIN
========================= */
app.use("/api/admin", adminClientsRoutes);
app.use("/api/admin", adminDevelopersRoutes);
app.use("/api/admin", adminCareersRoutes);
app.use("/api/admin", adminClientStoriesRoutes);

/* =========================
   AGENT
========================= */
app.use("/api/agent", agentRoutes);

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
   res.json({ ok: true, service: "aouad-crm-backend" });
});
app.use("/api/admin", require("./routes/admin.routes"));
app.get("/listing/:id", async (req, res) => {
   try {
      const id = String(req.params.id || "").trim();

      const item = await prisma.listing.findFirst({
         where: {
            id,
            deletedAt: null,
            isHidden: false,
         },
         include: {
            images: { orderBy: { order: "asc" } },
         },
      });

      if (!item) {
         return res.redirect("https://www.aouad.co/");
      }

      const image =
         item.mainImageUrl ||
         item.coverImageUrl ||
         item.images?.[0]?.url ||
         "https://www.aouad.co/blacklogo.png";

      const title = item.title || "Property Listing";
      const desc =
         `${item.city || ""} ${item.area || ""}`.trim() ||
         "View this property on Aouad Real Estate";

      return res.send(`
<!doctype html>
<html>
<head>
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="https://www.aouad.co/listing/${id}" />
<meta property="og:type" content="website" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="${image}" />

<script>
  window.location.href = "https://www.aouad.co/listing/${id}";
</script>
</head>
<body></body>
</html>
      `);
   } catch (e) {
      console.error(e);
      return res.redirect("https://www.aouad.co/");
   }
});
module.exports = { app };