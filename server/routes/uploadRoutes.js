const express = require("express");
const router = express.Router();
const cloudinaryService = require("../services/cloudinaryService");

/**
 * GET /api/upload/status
 * Check if Cloudinary credentials are fully active
 */
router.get("/status", (req, res) => {
  return res.json({
    ok: true,
    configured: cloudinaryService.isConfigured(),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKeyConfigured: Boolean(process.env.CLOUDINARY_API_KEY || "691365116427346"),
  });
});

/**
 * POST /api/upload/image
 * Generic image uploader for profile photos, machinery units, receipts, and avatars
 * Payload: { image: string (base64 data URI), folder: string (optional), filename: string (optional) }
 */
router.post("/image", async (req, res) => {
  try {
    const { image, folder, filename } = req.body;
    if (!image) {
      return res.status(400).json({ ok: false, error: "Image data is required." });
    }

    // Determine target folder
    const targetFolder = folder || "kimpc";
    const result = await cloudinaryService.uploadImage(image, {
      folder: targetFolder,
      filename,
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
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to upload image.",
    });
  }
});

module.exports = router;

