// src/routes/public.careers.routes.js
const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { prisma } = require("../lib/prisma");

const MAX_MB = 10;
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "cv");

function ensureDir() {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
ensureDir();

function safeExt(originalName) {
    const ext = (path.extname(originalName || "") || "").toLowerCase();
    if ([".pdf", ".doc", ".docx"].includes(ext)) return ext;
    return null;
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = safeExt(file.originalname) || ".bin";
        const stamp = Date.now();
        const rand = Math.random().toString(16).slice(2);
        cb(null, `cv_${stamp}_${rand}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_MB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = safeExt(file.originalname);
        if (!ok) return cb(new Error("CV must be PDF/DOC/DOCX"));
        cb(null, true);
    },
});

// GET /api/public/careers
router.get("/careers", async (req, res) => {
    try {
        const items = await prisma.careerJob.findMany({
            where: { isActive: true },
            orderBy: { updatedAt: "desc" },
        });
        res.json({ items });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load careers" });
    }
});

// POST /api/public/careers/:id/apply
router.post("/careers/:id/apply", (req, res) => {
    upload.single("cv")(req, res, async (err) => {
        try {
            if (err) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(400).json({ error: `CV is too large. Max ${MAX_MB}MB.` });
                }
                return res.status(400).json({ error: err.message || "Upload failed" });
            }

            const jobId = req.params.id;

            const job = await prisma.careerJob.findUnique({ where: { id: jobId } });
            if (!job || !job.isActive) return res.status(404).json({ error: "Job not found" });

            const fullName = String(req.body.fullName || "").trim();
            const email = String(req.body.email || "").trim().toLowerCase();
            const phone = String(req.body.phone || "").trim() || null;
            const coverLetter = String(req.body.coverLetter || "").trim() || null;

            if (fullName.length < 2) return res.status(400).json({ error: "Full name is required" });
            if (!email.includes("@")) return res.status(400).json({ error: "Email is required" });

            const cvUrl = req.file ? `/uploads/cv/${req.file.filename}` : null;

            const application = await prisma.careerApplication.create({
                data: {
                    jobId,
                    fullName,
                    email,
                    phone,
                    coverLetter,
                    cvUrl,
                },
            });

            res.json({ ok: true, applicationId: application.id });
        } catch (e2) {
            console.error(e2);
            res.status(400).json({ error: e2.message || "Failed to apply" });
        }
    });
});

module.exports = router;
