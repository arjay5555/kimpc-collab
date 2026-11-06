const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

// Configure Cloudinary with environment variables
function initCloudinary() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY || "691365116427346";
  const api_secret = process.env.CLOUDINARY_API_SECRET || "0aNAAV2XYUo_0xyuHa6WUfhKKnY";

  if (cloud_name && api_key && api_secret) {
    cloudinary.config({
      cloud_name,
      api_key,
      api_secret,
      secure: true,
    });
    return true;
  }
  return false;
}

/**
 * Checks if Cloudinary credentials are fully configured
 */
function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    (process.env.CLOUDINARY_API_KEY || "691365116427346") &&
    (process.env.CLOUDINARY_API_SECRET || "0aNAAV2XYUo_0xyuHa6WUfhKKnY")
  );
}

/**
 * Uploads an image (base64 string, data URI, or file path) to Cloudinary.
 * Falls back to local disk storage if Cloudinary is not configured or fails.
 *
 * @param {string|Buffer} imageInput - Base64 data URI ("data:image/..."), raw base64, or file path
 * @param {Object} options - Upload options (folder, filename, tags, etc.)
 * @returns {Promise<{ ok: boolean, url: string, publicId?: string, provider: string, error?: string }>}
 */
async function uploadImage(imageInput, options = {}) {
  if (!imageInput) {
    throw new Error("No image data provided for upload.");
  }

  const folder = options.folder || "kimpc";
  const canUseCloudinary = initCloudinary();

  if (canUseCloudinary) {
    try {
      // Cloudinary supports direct base64 data URIs ("data:image/jpeg;base64,...") and URLs
      let uploadTarget = imageInput;

      // If buffer, convert to base64 data URI
      if (Buffer.isBuffer(imageInput)) {
        uploadTarget = `data:image/jpeg;base64,${imageInput.toString("base64")}`;
      } else if (typeof imageInput === "string" && !imageInput.startsWith("data:") && !imageInput.startsWith("http")) {
        // Raw base64 string
        uploadTarget = `data:image/jpeg;base64,${imageInput}`;
      }

      const uploadResult = await cloudinary.uploader.upload(uploadTarget, {
        folder,
        resource_type: "image",
        transformation: options.transformation || [
          { quality: "auto:good", fetch_format: "auto" }
        ],
        tags: options.tags || ["kimpc"],
      });

      return {
        ok: true,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        provider: "cloudinary",
        format: uploadResult.format,
        width: uploadResult.width,
        height: uploadResult.height,
      };
    } catch (err) {
      console.warn("⚠️ Cloudinary upload encountered an error, falling back to local storage:", err.message);
    }
  } else {
    console.warn("⚠️ CLOUDINARY_CLOUD_NAME is not set. Storing uploaded file locally in /uploads directory.");
  }

  // Graceful local fallback if Cloudinary is unconfigured or fails
  try {
    const uploadsDir = path.join(__dirname, "..", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    let buffer;
    let ext = "jpg";

    if (Buffer.isBuffer(imageInput)) {
      buffer = imageInput;
    } else if (typeof imageInput === "string") {
      const match = imageInput.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        ext = match[1] === "jpeg" ? "jpg" : match[1];
        buffer = Buffer.from(match[2], "base64");
      } else {
        buffer = Buffer.from(imageInput, "base64");
      }
    }

    const safeFilename = `${folder.replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
    const targetPath = path.join(uploadsDir, safeFilename);
    fs.writeFileSync(targetPath, buffer);

    return {
      ok: true,
      url: `/uploads/${safeFilename}`,
      provider: "local",
    };
  } catch (localErr) {
    console.error("Local upload fallback failed:", localErr);
    throw new Error("Failed to save image to both Cloudinary and local storage.");
  }
}

/**
 * Deletes an image from Cloudinary by its publicId
 */
async function deleteImage(publicId) {
  if (!publicId || !isConfigured()) return false;
  try {
    initCloudinary();
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (err) {
    console.warn("Failed to delete image from Cloudinary:", err.message);
    return false;
  }
}

module.exports = {
  uploadImage,
  deleteImage,
  isConfigured,
  cloudinary,
};

