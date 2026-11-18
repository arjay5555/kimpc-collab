const express = require("express");
const router = express.Router();
const ocrService = require("../services/ocrService");
const authenticate = require("../middleware/authenticate");

/**
 * POST /api/ocr/gcash
 * Extracts GCash reference number, amount, date, and duplicate check from an uploaded receipt image.
 */
router.post("/gcash", authenticate, async (req, res) => {
  try {
    const { imageDataUrl, imageUrl, expectedAmount, excludeApplicationId } = req.body || {};
    const result = await ocrService.scanGcashReceipt({
      imageDataUrl,
      imageUrl,
      expectedAmount,
      excludeApplicationId,
    });

    if (!result.ok) {
      const status = result.disabled ? 403 : 422;
      return res.status(status).json(result);
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed to scan GCash receipt." });
  }
});

module.exports = router;

