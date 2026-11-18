const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");
const SystemSetting = require("../models/SystemSetting");
const { getEffectiveCloudinaryKeys } = require("./apiKeyManager");

// Configure Cloudinary with effective credentials
function initCloudinary(creds) {
  if (creds && creds.cloudName && creds.apiKey && creds.apiSecret) {
    cloudinary.config({
      cloud_name: creds.cloudName,
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
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
  const name = process.env.CUSTOM_CLOUDINARY_CLOUD_NAME || process.env.DEFAULT_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CUSTOM_CLOUDINARY_API_KEY || process.env.DEFAULT_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY;
  const sec = process.env.CUSTOM_CLOUDINARY_API_SECRET || process.env.DEFAULT_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET;
  return Boolean(name && key && sec);
}

/**
 * Uploads an image (base64 string, data URI, or file path) to Cloudinary.
 * Falls back to local disk storage if Cloudinary is not configured or fails.
 *
 * @param {string|Buffer} imageInput - Base64 data URI ("data:image/..."), raw base64, or file path
 * @param {Object} options - Upload options (folder, filename, tags, etc.)
 * @returns {Promise<{ ok: boolean, url: string, publicId?: string, provider: string, error?: string }>}
 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Detect image type from magic bytes. Returns a safe extension or null.
function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.slice(0, 6).toString("ascii") === "GIF87a" || buf.slice(0, 6).toString("ascii") === "GIF89a") return "gif";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

// Validate and normalize an upload input (Buffer, data URI, raw base64, or https URL).
function normalizeImageInput(input) {
  if (typeof input === "string" && /^https?:\/\//i.test(input)) {
    return input;
  }
  let buf;
  if (Buffer.isBuffer(input)) {
    buf = input;
  } else if (typeof input === "string") {
    const m = input.match(/^data:([^;,]+);base64,(.+)$/s);
    if (m && !/^image\/(jpeg|jpg|png|gif|webp)$/i.test(m[1])) {
      throw new Error("Only JPEG, PNG, GIF or WEBP images are allowed.");
    }
    buf = Buffer.from(m ? m[2] : input, "base64");
  } else {
    throw new Error("Invalid image data.");
  }
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("Image is too large (max 10 MB).");
  const type = detectImageType(buf);
  if (!type) throw new Error("Only JPEG, PNG, GIF or WEBP images are allowed.");
  const mime = type === "jpg" ? "jpeg" : type;
  return `data:image/${mime};base64,${buf.toString("base64")}`;
}

async function uploadImage(imageInput, options = {}) {
  if (!imageInput) {
    throw new Error("No image data provided for upload.");
  }

  // Only accept real raster images (prevents storing HTML/SVG/JS that would be served from our origin).
  imageInput = normalizeImageInput(imageInput);

  // Check system setting toggle
  let cloudinaryEnabled = true;
  try {
    const settingDoc = await SystemSetting.findOne({ key: "cloudinaryEnabled" });
    if (settingDoc && settingDoc.value === false) {
      cloudinaryEnabled = false;
    }
  } catch (err) {
    // default true
  }

  const creds = await getEffectiveCloudinaryKeys();
  const folder = options.folder || "kimpc";
  const canUseCloudinary = cloudinaryEnabled && initCloudinary(creds);

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
  } else if (!cloudinaryEnabled) {
    console.log("ℹ️ Cloudinary media storage is disabled in System Settings. Storing uploaded file locally in /uploads directory.");
  } else {
    console.warn("⚠️ CLOUDINARY_CLOUD_NAME is not set. Storing uploaded file locally in /uploads directory.");
  }

  // Graceful local fallback if Cloudinary is unconfigured or fails
  try {
    const uploadsDir = path.join(__dirname, "..", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    if (typeof imageInput === "string" && imageInput.startsWith("http")) {
      // Remote URLs can't be stored locally; keep the original reference.
      return { ok: true, url: imageInput, provider: "remote" };
    }
    const buffer = Buffer.isBuffer(imageInput)
      ? imageInput
      : Buffer.from(String(imageInput).replace(/^data:image\/[a-z]+;base64,/i, ""), "base64");
    const ext = detectImageType(buffer);
    if (!ext) throw new Error("Unsupported image format.");

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

