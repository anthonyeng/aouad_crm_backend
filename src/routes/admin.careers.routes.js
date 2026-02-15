// src/routes/admin.careers.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../lib/prisma");

// IMPORTANT: your folder is /src/middlewares (plural)
const authMod = require("../middlewares/auth");
const roleMod = require("../middlewares/requireRole");

function pickFn(mod, name) {
    if (typeof mod === "function") return mod;
    if (mod && typeof mod[name] === "function") return mod[name];
    return null;
}

const auth = pickFn(authMod, "auth");
const requireRole = pickFn(roleMod, "requireRole");

if (typeof auth !== "function") throw new Error("auth middleware not found in src/middlewares/auth.js");
if (typeof requireRole !== "function") throw new Error("requireRole middleware not found in src/middlewares/requireRole.js");

const JobSchema = z.object({
    title: z.string().min(3),
    type: z.string().min(1),
    location: z.string().min(1),
    dept: z.string().min(1),

    workMode: z.string().optional().nullable(),
    seniority: z.string().optional().nullable(),
    currency: z.string().optional().nullable(),
    salaryMin: z.number().int().optional().nullable(),
    salaryMax: z.number().int().optional().nullable(),

    responsibilities: z.string().optional().nullable(),
    requirements: z.string().optional().nullable(),
    benefits: z.string().optional().nullable(),

    applyEmail: z.string().email().optional().nullable(),
    isActive: z.boolean().optional(),
});

// ✅ GET /api/admin/careers (with applicants count)
router.get("/careers", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        const items = await prisma.careerJob.findMany({
            orderBy: { updatedAt: "desc" },
            include: {
                _count: { select: { applications: true } },
            },
        });
        res.json({ items });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load careers" });
    }
});

// ✅ GET /api/admin/careers/:id/applications
router.get("/careers/:id/applications", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        const jobId = req.params.id;

        const job = await prisma.careerJob.findUnique({
            where: { id: jobId },
            select: { id: true, title: true },
        });

        if (!job) return res.status(404).json({ error: "Job not found" });

        const items = await prisma.careerApplication.findMany({
            where: { jobId },
            orderBy: { createdAt: "desc" },
        });

        res.json({ job, items });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load applications" });
    }
});

// POST /api/admin/careers
router.post("/careers", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        const payload = JobSchema.parse(req.body);

        const item = await prisma.careerJob.create({
            data: {
                ...payload,
                workMode: payload.workMode ?? null,
                seniority: payload.seniority ?? null,
                currency: payload.currency ?? null,
                salaryMin: payload.salaryMin ?? null,
                salaryMax: payload.salaryMax ?? null,
                responsibilities: payload.responsibilities ?? null,
                requirements: payload.requirements ?? null,
                benefits: payload.benefits ?? null,
                applyEmail: payload.applyEmail ?? null,
                isActive: payload.isActive ?? true,
            },
        });

        res.json({ item });
    } catch (e) {
        res.status(400).json({ error: e.message || "Failed to create job" });
    }
});

// PATCH /api/admin/careers/:id
router.patch("/careers/:id", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        const payload = JobSchema.partial().parse(req.body);

        const item = await prisma.careerJob.update({
            where: { id: req.params.id },
            data: {
                ...payload,
                workMode: payload.workMode ?? undefined,
                seniority: payload.seniority ?? undefined,
            },
        });

        res.json({ item });
    } catch (e) {
        res.status(400).json({ error: e.message || "Failed to update job" });
    }
});

// DELETE /api/admin/careers/:id
router.delete("/careers/:id", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        await prisma.careerJob.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message || "Failed to delete job" });
    }
});

// (Optional) DELETE /api/admin/careers/applications/:appId
router.delete("/careers/applications/:appId", auth, requireRole("ADMIN"), async (req, res) => {
    try {
        await prisma.careerApplication.delete({ where: { id: req.params.appId } });
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message || "Failed to delete application" });
    }
});

module.exports = router;
