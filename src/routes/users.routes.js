// src/routes/users.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { auth } = require("../middlewares/auth");
const { requireRole } = require("../middlewares/requireRole");
const bcrypt = require("bcryptjs");

// GET /api/users?role=AGENT  (ADMIN)
router.get("/", auth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    role: z.enum(["ADMIN", "AGENT"]).optional(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.flatten() });
  }

  const where = {
    isActive: true,
    ...(parsed.data.role ? { role: parsed.data.role } : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,

      // profile fields
      slug: true,
      title: true,
      bio: true,
      languages: true,
      photoUrl: true,
      hero: true,
      sortOrder: true,
    },
  });

  res.json({ items: users });
});

// POST /api/users (ADMIN) -> create new AGENT
router.post("/", auth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional().nullable(),
    password: z.string().min(6),

    // profile
    slug: z.string().min(2).optional().nullable(),
    title: z.string().optional().nullable(),
    bio: z.string().optional().nullable(),
    languages: z.array(z.string()).optional(),
    photoUrl: z.string().url().optional().nullable(),
    hero: z.string().optional().nullable(),
    sortOrder: z.number().int().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.flatten() });
  }

  const data = parsed.data;

  const passwordHash = await bcrypt.hash(data.password, 10);

  const created = await prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      passwordHash,
      role: "AGENT",
      isActive: true,

      slug: data.slug || null,
      title: data.title || null,
      bio: data.bio || null,
      languages: data.languages || [],
      photoUrl: data.photoUrl || null,
      hero: data.hero || null,
      sortOrder: data.sortOrder ?? 0,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      slug: true,
      title: true,
      bio: true,
      languages: true,
      photoUrl: true,
      hero: true,
      sortOrder: true,
    },
  });

  res.status(201).json({ item: created });
});

// PATCH /api/users/:id (ADMIN) -> update agent fields
router.patch("/:id", auth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional().nullable(),
    isActive: z.boolean().optional(),

    // profile
    slug: z.string().min(2).optional().nullable(),
    title: z.string().optional().nullable(),
    bio: z.string().optional().nullable(),
    languages: z.array(z.string()).optional(),
    photoUrl: z.string().url().optional().nullable(),
    hero: z.string().optional().nullable(),
    sortOrder: z.number().int().optional(),
    password: z.string().min(6).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.flatten() });
  }

  const patch = { ...parsed.data };
  if (patch.email) patch.email = patch.email.toLowerCase();

  if (patch.password) {
    patch.passwordHash = await bcrypt.hash(patch.password, 10);
    delete patch.password;
  }

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: patch,
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      slug: true,
      title: true,
      bio: true,
      languages: true,
      photoUrl: true,
      hero: true,
      sortOrder: true,
    },
  });

  res.json({ item: updated });
});

// ✅ DELETE /api/users/:id (ADMIN) -> soft delete agent (set isActive=false)
router.delete("/:id", auth, requireRole("ADMIN"), async (req, res) => {
  try {
    const schema = z.object({
      id: z.string().min(1),
    });

    const parsedParams = schema.safeParse({ id: req.params.id });
    if (!parsedParams.success) {
      return res
        .status(400)
        .json({ error: "Invalid id", details: parsedParams.error.flatten() });
    }

    // optional: ensure target exists
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, isActive: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    // optional: prevent deleting admins
    if (existing.role === "ADMIN") {
      return res.status(400).json({ error: "Cannot delete an ADMIN user" });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
      select: {
        id: true,
        isActive: true,
      },
    });

    return res.json({ ok: true, item: updated });
  } catch (err) {
    console.error("DELETE /api/users/:id failed:", err);
    return res.status(500).json({ error: "Failed to delete agent" });
  }
});

module.exports = router;
