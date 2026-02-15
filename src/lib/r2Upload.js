const { PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const path = require("path");
const { getR2Client } = require("./r2"); // adjust path if your file name differs

function extFromMime(mime, originalname = "") {
    const fromName = path.extname(originalname).toLowerCase();
    if (fromName && fromName.length <= 6) return fromName;

    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    if (mime === "image/jpeg") return ".jpg";
    if (mime === "image/jpg") return ".jpg";

    return ".jpg";
}

async function uploadToR2({ buffer, mimeType, originalName, folder }) {
    const {
        R2_BUCKET,
        R2_PUBLIC_BASE_URL, // e.g. https://cdn.yoursite.com OR https://<account>.r2.dev
    } = process.env;

    if (!R2_BUCKET) throw new Error("Missing R2_BUCKET env var");
    if (!R2_PUBLIC_BASE_URL) throw new Error("Missing R2_PUBLIC_BASE_URL env var");

    const client = getR2Client();
    const ext = extFromMime(mimeType, originalName);
    const key = `${folder}/${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;

    await client.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: mimeType || "application/octet-stream",
            // If you're serving via public bucket / custom domain, this matters:
            ACL: undefined, // R2 ignores ACL; keep undefined
        })
    );

    const base = String(R2_PUBLIC_BASE_URL).replace(/\/+$/, "");
    const url = `${base}/${key}`;

    return { key, url };
}

module.exports = { uploadToR2 };
