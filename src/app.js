// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const listingsRoutes = require("./routes/listings.routes");
const uploadsRoutes = require("./routes/uploads.routes");
const usersRoutes = require("./routes/users.routes");
const publicRoutes = require("./routes/public.routes");

// ✅ admin CRM clients
const adminClientsRoutes = require("./routes/admin.clients.routes");

// ✅ developers routes
const adminDevelopersRoutes = require("./routes/admin.developers.routes");
const publicDevelopersRoutes = require("./routes/public.developers.routes");

// ✅ careers routes
const publicCareersRoutes = require("./routes/public.careers.routes");
const adminCareersRoutes = require("./routes/admin.careers.routes");

const app = express();

/* =========================
   MIDDLEWARE
========================= */
app.use(helmet());

app.use(
  cors({
    origin: true, // put your frontend URL(s) here if you want stricter CORS
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(morgan("dev"));

/* =========================
   ROUTES
========================= */
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ✅ serve uploaded files publicly (developer logos, listing images, etc.)
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

/* ===== PUBLIC (no auth) ===== */
app.use("/api/public", publicRoutes);
app.use("/api/public", publicDevelopersRoutes);
app.use("/api/public", publicCareersRoutes);

/* ===== AUTH ===== */
app.use("/api/auth", authRoutes);

/* ===== CORE ===== */
app.use("/api/listings", listingsRoutes);
app.use("/api/users", usersRoutes);

/* ===== UPLOADS (protected inside uploads.routes.js) ===== */
app.use("/api/uploads", uploadsRoutes);

/* ===== ADMIN ===== */
app.use("/api/admin", adminClientsRoutes);
app.use("/api/admin", adminDevelopersRoutes);
app.use("/api/admin", adminCareersRoutes);

app.get("/", (req, res) => {
  res.json({ ok: true, service: "aouad-crm-backend" });
});

module.exports = { app };
