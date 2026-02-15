// src/routes/admin.developers.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { auth } = require("../middlewares/auth");
const { requireRole } = require("../middlewares/requireRole");

const multer = require("multer");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const path = require("path");

// ✅ your existing R2 client helper
const { getR2Client } = require("../lib/r2"); // adjust if your file name/path differs

router.use(auth, requireRole("ADMIN"));

/* =========================
   Upload setup (memory)
========================= */
const upload = multer({ storage: multer.memoryStorage() });

function extFromMime(mime, originalname = "") {
    const fromName = path.extname(originalname).toLowerCase();
    if (fromName && fromName.length <= 6) return fromName;

    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";

    return ".jpg";
}

async function uploadLogoToR2(file) {
    const { R2_BUCKET, R2_PUBLIC_BASE_URL } = process.env;

    if (!R2_BUCKET) throw new Error("Missing R2_BUCKET env var");
    if (!R2_PUBLIC_BASE_URL) throw new Error("Missing R2_PUBLIC_BASE_URL env var");

    const client = getR2Client();
    const ext = extFromMime(file.mimetype, file.originalname);

    // folder inside your bucket
    const key = `developers/dev_${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;

    await client.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype || "application/octet-stream",
        })
    );

    const base = String(R2_PUBLIC_BASE_URL).replace(/\/+$/, "");
    const url = `${base}/${key}`;

    return { key, url };
}

function toBoolAny(v, fallback = true) {
    if (v == null || v === "") return fallback;
    if (typeof v === "boolean") return v;
    const s = String(v).toLowerCase().trim();
    if (s === "false" || s === "0" || s === "no") return false;
    if (s === "true" || s === "1" || s === "yes") return true;
    return fallback;
}

function toIntAny(v, fallback = 0) {
    if (v == null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/* =========================
   GET /api/admin/developers?q=
========================= */
router.get("/developers", async (req, res) => {
    const q = String(req.query.q || "").trim();
    const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" } }] } : {};

    const items = await prisma.developer.findMany({
        where,
        orderBy: [{ isFeatured: "desc" }, { featuredOrder: "asc" }, { createdAt: "desc" }],
    });

    res.json({ items });
});

/* =========================
   POST /api/admin/developers  (multipart/form-data)
   Fields:
     - name (required)
     - description (optional)
     - website (optional)
     - isFeatured (optional, string/boolean)
     - featuredOrder (optional, string/number)
   File:
     - logo (required image file)
========================= */
router.post("/developers", upload.single("logo"), async (req, res) => {
    try {
        const schema = z.object({
            name: z.string().min(1),
            description: z.string().optional().nullable(),
            website: z.string().url().optional().nullable(),
            isFeatured: z.any().optional(),
            featuredOrder: z.any().optional(),
        });

        const body = schema.parse(req.body);

        if (!req.file) return res.status(400).json({ error: "Missing logo file" });
        if (!String(req.file.mimetype || "").startsWith("image/")) {
            return res.status(400).json({ error: "Logo must be an image" });
        }

        // ✅ upload file to R2 and get a public URL
        const { url: logoUrl } = await uploadLogoToR2(req.file);

        const created = await prisma.developer.create({
            data: {
                name: String(body.name).trim(),
                description: (body.description ?? "").toString().trim(),
                website: body.website ? String(body.website).trim() : null,
                isFeatured: toBoolAny(body.isFeatured, true),
                featuredOrder: toIntAny(body.featuredOrder, 0),
                logoUrl,
            },
        });

        res.json({ item: created });
    } catch (e) {
        console.error(e);
        const msg = e?.issues?.[0]?.message || e.message || "Failed to create developer";
        res.status(400).json({ error: msg });
    }
});

/* =========================
   PATCH /api/admin/developers/:id  (JSON)
========================= */
router.patch("/developers/:id", async (req, res) => {
    try {
        const schema = z.object({
            name: z.string().min(1).optional(),
            description: z.string().optional().nullable(),
            logoUrl: z.string().url().optional().nullable(),
            website: z.string().url().optional().nullable(),
            isFeatured: z.boolean().optional(),
            featuredOrder: z.number().int().optional(),
        });

        const data = schema.parse(req.body);

        const updated = await prisma.developer.update({
            where: { id: req.params.id },
            data,
        });

        res.json({ item: updated });
    } catch (e) {
        console.error(e);
        const msg = e?.issues?.[0]?.message || e.message || "Failed to update developer";
        res.status(400).json({ error: msg });
    }
});


router.delete("/developers/:id", async (req, res) => {
    await prisma.developer.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
});

module.exports = router;
