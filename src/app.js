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

const leadsRoutes = require("./routes/leads.routes");
const publicLeadsRoutes = require("./routes/public.leads.routes");
const publicBookingRoutes = require("./routes/public.booking.routes");

const adminClientsRoutes = require("./routes/admin.clients.routes");
const adminDevelopersRoutes = require("./routes/admin.developers.routes");
const adminCareersRoutes = require("./routes/admin.careers.routes");
const adminClientStoriesRoutes = require("./routes/admin.clientStories.routes");

const publicDevelopersRoutes = require("./routes/public.developers.routes");
const publicCareersRoutes = require("./routes/public.careers.routes");
const publicClientStoriesRoutes = require("./routes/public.clientStories.routes");
const publicListingsRoutes = require("./routes/public.listings.routes");

const agentRoutes = require("./routes/agent.routes");

const app = express();

const FRONTEND_URL = "https://aouad.co";
const FALLBACK_IMAGE = `${FRONTEND_URL}/blacklogo.png`;

function escapeHtml(value) {
   return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
}

function toAbsoluteUrl(url) {
   if (!url) return null;

   const trimmed = String(url).trim();
   if (!trimmed) return null;

   if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
   }

   if (trimmed.startsWith("/uploads/")) {
      return `https://aouad-crm-backend.onrender.com${trimmed}`;
   }

   if (trimmed.startsWith("/")) {
      return `${FRONTEND_URL}${trimmed}`;
   }

   return trimmed;
}

function pickListingImage(item) {
   const cover = item.images?.find((img) => img.isCover && img.url);
   if (cover) return toAbsoluteUrl(cover.url);

   const first = item.images?.find((img) => img.url);
   if (first) return toAbsoluteUrl(first.url);

   return FALLBACK_IMAGE;
}

function buildListingDescription(item) {
   const parts = [];

   if (item.country) parts.push(item.country);
   if (item.city) parts.push(item.city);
   if (item.area) parts.push(item.area);
   if (item.community) parts.push(item.community);
   if (item.projectName) parts.push(item.projectName);

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
   OG IMAGE PROXY
   Proxies listing cover image through our own domain so WhatsApp's bot
   fetches from a URL it hasn't cached before.
========================= */
app.get("/og-image/:id", async (req, res) => {
   try {
      const id = String(req.params.id || "").trim();
      const item = await prisma.listing.findFirst({
         where: { id, deletedAt: null },
         include: { images: { orderBy: { order: "asc" } } },
      });

      const imageUrl = pickListingImage(item);
      if (!imageUrl || imageUrl === FALLBACK_IMAGE) {
         return res.redirect(FALLBACK_IMAGE);
      }

      // Redirect to the actual image with ?og=1 appended.
      // This gives WhatsApp a URL it has never cached, so it fetches fresh,
      // while keeping the actual download direct from the CDN (fast).
      const sep = imageUrl.includes("?") ? "&" : "?";
      return res.redirect(302, `${imageUrl}${sep}og=1`);
   } catch (e) {
      console.error("og-image proxy error:", e.message);
      return res.redirect(FALLBACK_IMAGE);
   }
});

/* =========================
   LISTING OG PREVIEW ROUTE
========================= */
app.get("/listing/:id", async (req, res) => {
   try {
      const id = String(req.params.id || "").trim();

      if (!id) {
         return res.redirect(FRONTEND_URL);
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
         return res.redirect(FRONTEND_URL);
      }

      const frontendUrl = `${FRONTEND_URL}/listing/${encodeURIComponent(id)}`;
      const title = escapeHtml(item.title || "Property Listing");
      const desc = escapeHtml(buildListingDescription(item));
      const imgV = req.query.v ? `?v=${encodeURIComponent(req.query.v)}` : "";
      const proxyImage = escapeHtml(`https://${req.headers.host}/og-image/${id}${imgV}`);
      const url = escapeHtml(frontendUrl);

      // Always serve OG tags + JS redirect for browsers.
      // Bots (WhatsApp, opengraph scrapers, etc.) read the <head> OG tags and
      // ignore the <script>. Browsers execute the script and land on the SPA.
      res.set({
         "Content-Type": "text/html; charset=utf-8",
         "Cache-Control": "no-store",
      });

      return res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>

  <meta name="description" content="${desc}" />
  <link rel="canonical" href="${url}" />
  <meta http-equiv="refresh" content="0;url=${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Aouad Real Estate" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${proxyImage}" />
  <meta property="og:image:secure_url" content="${proxyImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="800" />
  <meta property="og:url" content="${url}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${proxyImage}" />
</head>
<body>
</body>
</html>`);
   } catch (e) {
      console.error("Listing OG route error:", e);
      return res.redirect(FRONTEND_URL);
   }
});

/* =========================
   PUBLIC (NO AUTH)
========================= */
app.use("/api/public", publicClientStoriesRoutes);
app.use("/api/public", publicDevelopersRoutes);
app.use("/api/public", publicCareersRoutes);
app.use("/api/public", publicListingsRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/public", publicLeadsRoutes);
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