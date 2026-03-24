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

// LEADS
const leadsRoutes = require("./routes/leads.routes");
const publicLeadsRoutes = require("./routes/public.leads.routes");

// public booking
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

function escapeHtml(value) {
   return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
}

function pickListingImage(item) {
   return (
      item.mainImageUrl ||
      item.coverImageUrl ||
      item.thumbnailUrl ||
      item.images?.[0]?.url ||
      item.images?.[0]?.imageUrl ||
      item.images?.[0]?.src ||
      item.images?.[0]?.publicUrl ||
      "https://www.aouad.co/blacklogo.png"
   );
}

function buildListingDescription(item) {
   const parts = [];

   if (item.city) parts.push(item.city);
   if (item.area) parts.push(item.area);
   if (item.community) parts.push(item.community);
   if (item.projectName) parts.push(item.projectName);

   if (item.price) {
      parts.push(`$${item.price}`);
   }

   return parts.join(" • ") || "View this property on Aouad Real Estate";
}

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
   LISTING OG PREVIEW ROUTE
   IMPORTANT:
   Frontend Render rewrite must send:
   /listing/* -> https://aouad-crm-backend.onrender.com/listing/:splat
========================= */
app.get("/listing/:id", async (req, res) => {
   try {
      const id = String(req.params.id || "").trim();

      if (!id) {
         return res.redirect("https://www.aouad.co/");
      }

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

      const frontendUrl = `https://www.aouad.co/listing/${encodeURIComponent(id)}`;
      const title = escapeHtml(item.title || "Property Listing");
      const desc = escapeHtml(buildListingDescription(item));
      const image = escapeHtml(pickListingImage(item));
      const url = escapeHtml(frontendUrl);

      res.set("Content-Type", "text/html; charset=utf-8");

      return res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>

  <meta name="description" content="${desc}" />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="AOUAD. Real Estate" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${image}" />

  <meta http-equiv="refresh" content="0; url=${url}" />
</head>
<body>
  Redirecting...
</body>
</html>`);
   } catch (e) {
      console.error("Listing OG route error:", e);
      return res.redirect("https://www.aouad.co/");
   }
});

/* =========================
   PUBLIC (NO AUTH)
========================= */
// order matters
app.use("/api/public", publicClientStoriesRoutes);
app.use("/api/public", publicDevelopersRoutes);
app.use("/api/public", publicCareersRoutes);
app.use("/api/public", publicListingsRoutes);
app.use("/api/public", publicRoutes);

// public lead capture
app.use("/api/public", publicLeadsRoutes);

// public booking
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

// lead management
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
app.use("/api/admin", require("./routes/admin.routes"));

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

module.exports = { app };