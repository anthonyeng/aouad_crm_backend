// src/routes/uploads.routes.js
const router = require("express").Router();
const crypto = require("crypto");
const { z } = require("zod");
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const { prisma } = require("../lib/prisma");
const { auth } = require("../middlewares/auth");
const { getR2Client } = require("../lib/r2");

/* =========================
   Constants
========================= */

// ✅ 100MB max
const MAX_BYTES = 100 * 1024 * 1024;

/* =========================
   Helpers
========================= */

async function getListingOr404(listingId) {
  return prisma.listing.findUnique({ where: { id: listingId } });
}

function canAccessListing(req, listing) {
  return (
    req.user.role === "ADMIN" ||
    listing.createdById === req.user.sub ||
    listing.assignedAgentId === req.user.sub
  );
}

function assertBucketEnv(res) {
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_BASE_URL;

  if (!bucket || !publicBase) {
    res.status(500).json({ error: "Missing R2_BUCKET or R2_PUBLIC_BASE_URL" });
    return null;
  }
  return { bucket, publicBase };
}

function safeExt(ext) {
  return (
    String(ext || "")
      .replace(".", "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "jpg"
  );
}

/* =========================
   1) PRESIGN (upload URLs)
   - supports:
     A) Listing images
     B) Agent photo
========================= */

// Listing presign schema (added sizeBytes)
const listingPresignSchema = z.object({
  listingId: z.string(),
  files: z
    .array(
      z.object({
        contentType: z.string().min(3), // image/jpeg
        ext: z.string().min(1),         // jpg/png/webp
        isCover: z.boolean().optional(),
        sizeBytes: z.number().int().positive().optional(), // ✅ used for 100MB max
      })
    )
    .min(1)
    .max(15),
});

// Agent-photo presign schema (added sizeBytes)
const agentPresignSchema = z.object({
  type: z.literal("agent-photo"),
  contentType: z.string().min(3),
  ext: z.string().min(1),
  sizeBytes: z.number().int().positive().optional(), // ✅ used for 100MB max
});

router.post("/presign", auth, async (req, res) => {
  const listingParsed = listingPresignSchema.safeParse(req.body);
  const agentParsed = agentPresignSchema.safeParse(req.body);

  if (!listingParsed.success && !agentParsed.success) {
    return res.status(400).json({
      error: "Invalid body",
      details: {
        listingMode: listingParsed.success ? null : listingParsed.error.flatten(),
        agentMode: agentParsed.success ? null : agentParsed.error.flatten(),
      },
    });
  }

  const env = assertBucketEnv(res);
  if (!env) return;
  const { bucket, publicBase } = env;

  const r2 = getR2Client();

  /* ===== A) LISTING MODE ===== */
  if (listingParsed.success) {
    const { listingId, files } = listingParsed.data;

    // ✅ enforce 100MB max (by sizeBytes if provided)
    const tooBig = files.find((f) => typeof f.sizeBytes === "number" && f.sizeBytes > MAX_BYTES);
    if (tooBig) {
      return res.status(400).json({ error: "File too large. Max 100MB per image." });
    }

    const listing = await getListingOr404(listingId);
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    if (!canAccessListing(req, listing)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const coverCount = files.filter((f) => f.isCover).length;
    if (coverCount > 1) {
      return res.status(400).json({ error: "Only one file can be isCover=true" });
    }

    const uploads = [];
    for (const f of files) {
      const ext = safeExt(f.ext);
      const key = `listings/${listingId}/${Date.now()}_${crypto.randomBytes(8).toString("hex")}.${ext}`;

      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: f.contentType,
        CacheControl: "public, max-age=31536000, immutable",
      });

      const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: 60 * 10 });
      const publicUrl = `${publicBase}/${key}`;

      uploads.push({
        key,
        uploadUrl,
        publicUrl,
        isCover: !!f.isCover,
      });
    }

    return res.json({ uploads });
  }

  /* ===== B) AGENT PHOTO MODE ===== */
  // safest: admin-only
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { contentType, ext, sizeBytes } = agentParsed.data;

  // ✅ enforce 100MB max (by sizeBytes if provided)
  if (typeof sizeBytes === "number" && sizeBytes > MAX_BYTES) {
    return res.status(400).json({ error: "File too large. Max 100MB." });
  }

  const safe = safeExt(ext);
  const key = `agents/${Date.now()}_${crypto.randomBytes(8).toString("hex")}.${safe}`;

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });

  const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: 60 * 10 });
  const publicUrl = `${publicBase}/${key}`;

  return res.json({
    uploads: [{ key, uploadUrl, publicUrl }],
  });
});

/* =========================
   2) SAVE METADATA TO DB
   (listing images)
========================= */

const saveSchema = z.object({
  images: z
    .array(
      z.object({
        key: z.string().min(3),
        url: z.string().url(),
        isCover: z.boolean().optional(),
      })
    )
    .min(1)
    .max(15),
});

router.post("/listing/:id/images", auth, async (req, res) => {
  const listingId = req.params.id;

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }

  const listing = await getListingOr404(listingId);
  if (!listing) return res.status(404).json({ error: "Listing not found" });

  if (!canAccessListing(req, listing)) return res.status(403).json({ error: "Forbidden" });

  const coverCount = parsed.data.images.filter((i) => i.isCover).length;
  if (coverCount > 1) {
    return res.status(400).json({ error: "Only one image can be isCover=true" });
  }

  const existing = await prisma.listingImage.findMany({
    where: { listingId },
    orderBy: { order: "asc" },
  });

  let order = existing.length;

  const wantsCover = parsed.data.images.some((i) => i.isCover);
  if (wantsCover) {
    await prisma.listingImage.updateMany({
      where: { listingId, isCover: true },
      data: { isCover: false },
    });
  }

  const created = [];
  for (const img of parsed.data.images) {
    const row = await prisma.listingImage.create({
      data: {
        listingId,
        url: img.url,
        key: img.key,
        order,
        isCover: !!img.isCover,
      },
    });
    created.push(row);
    order++;
  }

  const coverNow = await prisma.listingImage.findFirst({ where: { listingId, isCover: true } });
  if (!coverNow) {
    const first = await prisma.listingImage.findFirst({
      where: { listingId },
      orderBy: { order: "asc" },
    });
    if (first) {
      await prisma.listingImage.update({ where: { id: first.id }, data: { isCover: true } });
    }
  }

  return res.json({ saved: created });
});

/* =========================
   3) SET COVER IMAGE
========================= */

router.post("/listing/:listingId/images/:imageId/cover", auth, async (req, res) => {
  const { listingId, imageId } = req.params;

  const listing = await getListingOr404(listingId);
  if (!listing) return res.status(404).json({ error: "Listing not found" });

  if (!canAccessListing(req, listing)) return res.status(403).json({ error: "Forbidden" });

  const img = await prisma.listingImage.findFirst({
    where: { id: imageId, listingId },
  });
  if (!img) return res.status(404).json({ error: "Image not found" });

  await prisma.listingImage.updateMany({
    where: { listingId, isCover: true },
    data: { isCover: false },
  });

  const updated = await prisma.listingImage.update({
    where: { id: imageId },
    data: { isCover: true },
  });

  return res.json({ cover: updated });
});

/* =========================
   4) DELETE IMAGE (DB + R2)
========================= */

router.delete("/listing/:listingId/images/:imageId", auth, async (req, res) => {
  const { listingId, imageId } = req.params;

  const listing = await getListingOr404(listingId);
  if (!listing) return res.status(404).json({ error: "Listing not found" });

  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

  const img = await prisma.listingImage.findFirst({
    where: { id: imageId, listingId },
  });
  if (!img) return res.status(404).json({ error: "Image not found" });

  await prisma.listingImage.delete({ where: { id: imageId } });

  const env = assertBucketEnv(res);
  if (!env) return;
  const { bucket } = env;

  try {
    const r2 = getR2Client();
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: img.key }));
  } catch (e) {
    console.error("R2 delete failed:", e);
  }

  const coverNow = await prisma.listingImage.findFirst({ where: { listingId, isCover: true } });
  if (!coverNow) {
    const first = await prisma.listingImage.findFirst({
      where: { listingId },
      orderBy: { order: "asc" },
    });
    if (first) {
      await prisma.listingImage.update({ where: { id: first.id }, data: { isCover: true } });
    }
  }

  return res.json({ success: true });
});

module.exports = router;
