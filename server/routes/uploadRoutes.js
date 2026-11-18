const express = require("express");
const router = express.Router();
const cloudinaryService = require("../services/cloudinaryService");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const { logAudit } = require("../services/auditLogger");

/**
 * GET /api/upload/status
 * Check if Cloudinary credentials are fully active
 */
router.get("/status", authenticate, (req, res) => {
  return res.json({
    ok: true,
    configured: cloudinaryService.isConfigured(),
    cloudName: process.env.CUSTOM_CLOUDINARY_CLOUD_NAME || process.env.DEFAULT_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || "kimpc",
    apiKeyConfigured: Boolean(process.env.CUSTOM_CLOUDINARY_API_KEY || process.env.DEFAULT_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY),
  });
});

/**
 * POST /api/upload/image
 * Generic image uploader for profile photos, machinery units, receipts, and avatars
 * Payload: { image: string (base64 data URI), folder: string (optional), filename: string (optional) }
 */
router.post("/image", authenticate, authorizeRoles("manager", "admin"), async (req, res) => {
  try {
    const { image, folder, filename } = req.body;
    if (!image) {
      return res.status(400).json({ ok: false, error: "Image data is required." });
    }

    // Determine target folder
    // Confine uploads to the app's own Cloudinary folder tree.
    const targetFolder = /^kimpc(\/[a-z0-9_-]{1,40}){0,3}$/i.test(String(folder || "")) ? String(folder) : "kimpc";
    const result = await cloudinaryService.uploadImage(image, {
      folder: targetFolder,
      filename,
    });

    await logAudit({
      action: "IMAGE_UPLOADED",
      module: "System",
      actorEmail: req.user?.email || "user",
      actorName: req.user?.fullName || "",
      actorRole: req.user?.role || "member",
      actorId: req.user?._id,
      affectedRecord: `Upload (${targetFolder})`,
      details: { folder: targetFolder, provider: result.provider, filename: filename || "" },
      status: "Success",
      req,
    });

    return res.status(201).json({
      ok: true,
      imageUrl: result.url,
      publicId: result.publicId || "",
      provider: result.provider,
      message: `Image uploaded successfully via ${result.provider}.`,
    });
  } catch (err) {
    console.error("Image upload route error:", err);
    const isValidation = /allowed|too large|Invalid image|Unsupported/i.test(err.message || "");
    return res.status(isValidation ? 400 : 500).json({
      ok: false,
      error: isValidation ? err.message : "Failed to upload image.",
    });
  }
});

module.exports = router;

