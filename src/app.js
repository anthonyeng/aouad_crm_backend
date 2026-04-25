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
   LISTING OG PREVIEW ROUTE
========================= */
app.get("/listing/:id", async (req, res) => {
   try {
      const id = String(req.params.id || "").trim();

      if (!id) {
         return res.redirect(FRONTEND_URL);
      }

      // Detect link-preview bots (WhatsApp, Telegram, Slack, Facebook, etc.)
      const ua = req.headers["user-agent"] || "";
      const isBot = /WhatsApp|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Applebot|Google|bot|crawler|spider/i.test(ua);

      // Regular browser — send them straight to the SPA via the root
      // (avoids rewrite loop: browser navigates to / which is not rewritten,
      //  then the SPA's sessionStorage handler redirects to /listing/:id)
      if (!isBot) {
         res.set("Content-Type", "text/html; charset=utf-8");
         return res.send(`<!doctype html>
<html><head><meta charset="UTF-8" /></head>
<body>
<script>
  sessionStorage.setItem('_goto_listing', ${JSON.stringify(id)});
  window.location.replace('/');
</script>
</body></html>`);
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
  <meta property="og:site_name" content="Aouad Real Estate" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:secure_url" content="${image}" />
  <meta property="og:url" content="${url}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${image}" />
</head>
<body></body>
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