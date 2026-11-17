const Application = require("../models/Application");
const { getEffectiveOcrSpaceKey } = require("./apiKeyManager");
const { getSystemSetting } = require("../models/SystemSetting");

const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";
const KIMPC_GCASH_DIGITS = "9264638983"; // 0926 463 8983

function parseAmountValue(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/,/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0 || num > 10000000) return null;
  return Number(num.toFixed(2));
}

function parseGcashText(rawText, { expectedAmount = null } = {}) {
  const text = String(rawText || "").trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const compactDigits = text.replace(/\s+/g, "");

  // 1. Reference Number extraction (handles GCash "Ref No. 1234 567 890123", "Reference No: ...")
  let referenceNumber = "";
  const labeledRefMatch =
    text.match(/Ref(?:erence)?\.?\s*(?:No\.?|ID|#)?\s*[:-]?\s*([0-9][0-9\s-]{6,22}[0-9])/i) ||
    text.match(/(?:Trace|Transaction)\s*(?:No\.?|ID)?\s*[:-]?\s*([A-Za-z0-9][A-Za-z0-9\s-]{6,22}[A-Za-z0-9])/i);

  if (labeledRefMatch && labeledRefMatch[1]) {
    referenceNumber = labeledRefMatch[1].replace(/[\s-]+/g, "").trim();
  } else {
    // Fallback: classic grouped 13-digit GCash reference pattern (e.g. 9012 345 678901)
    const groupedMatch = text.match(/\b(\d{4}\s+\d{3}\s+\d{6})\b/) || text.match(/\b(\d{13})\b/);
    if (groupedMatch && groupedMatch[1]) {
      referenceNumber = groupedMatch[1].replace(/\s+/g, "");
    }
  }

  // 2. Amount extraction (look for PHP / ₱ / Amount lines first, fallback to currency-formatted decimals)
  let amount = null;
  const amountPatterns = [
    /(?:Total\s+Amount\s+Sent|Amount\s+Due|Amount|Sent|Paid)\s*[:-]?\s*(?:PHP|Php|₱|P)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
    /(?:PHP|Php|₱)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2}))/,
    /P\s*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})/,
  ];

  for (const re of amountPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const candidate = parseAmountValue(m[1]);
      // Skip 10-11 digit phone numbers accidentally matched as amounts
      if (candidate !== null && candidate < 1000000) {
        amount = candidate;
        break;
      }
    }
  }

  // Fallback: look for lines containing decimals like 2,500.00 or 2500.00
  if (amount === null) {
    const decMatches = text.match(/\b([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]{3,6}\.[0-9]{2})\b/g) || [];
    for (const token of decMatches) {
      const candidate = parseAmountValue(token);
      if (candidate !== null && candidate < 1000000) {
        amount = candidate;
        break;
      }
    }
  }

  // 3. Date & Time extraction
  let dateTime = "";
  const dateMatch =
    text.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}(?:\s*,?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?)\b/i) ||
    text.match(/\b(\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2})?|\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)\b/i);
  if (dateMatch && dateMatch[1]) {
    dateTime = dateMatch[1].trim();
  }

  // 4. Recipient detection (0926 463 8983 / KIMPC)
  const matchesKimpcNumber =
    compactDigits.includes(KIMPC_GCASH_DIGITS) ||
    /kimpc|kalilangan\s+irrigators/i.test(text);

  const recipientLine =
    lines.find((l) => /0?926|kimpc|kalilangan/i.test(l)) ||
    lines.slice(0, 3).join(" · ").slice(0, 120);

  const expNum = expectedAmount !== null && expectedAmount !== undefined && expectedAmount !== ""
    ? Number(expectedAmount)
    : null;
  const amountMatchesExpected =
    amount !== null && Number.isFinite(expNum) && expNum > 0
      ? Math.abs(amount - expNum) < 1
      : null;

  return {
    referenceNumber,
    amount,
    dateTime,
    recipientText: recipientLine,
    matchesKimpcNumber,
    amountMatchesExpected,
    rawText: text.slice(0, 2000),
  };
}

async function callOcrSpace(apiKey, { imageDataUrl, imageUrl }, engine = "2") {
  const form = new FormData();
  form.append("apikey", apiKey);
  if (imageDataUrl) {
    form.append("base64Image", imageDataUrl);
  } else if (imageUrl) {
    form.append("url", imageUrl);
  }
  form.append("language", "eng");
  form.append("isOverlayRequired", "false");
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  form.append("OCREngine", engine);

  const res = await fetch(OCR_SPACE_ENDPOINT, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function checkDuplicateReference(referenceNumber, excludeApplicationId = null) {
  const cleanRef = String(referenceNumber || "").trim();
  if (!cleanRef || cleanRef.length < 6) return false;

  const query = {
    isVoidedBooking: { $ne: true },
    status: { $nin: ["Cancelled", "Declined", "Voided"] },
    $or: [
      { paymentReference: cleanRef },
      { "gcashOcr.referenceNumber": cleanRef },
      {
        paymentHistory: {
          $elemMatch: {
            referenceNumber: cleanRef,
            isVoided: { $ne: true },
          },
        },
      },
    ],
  };

  if (excludeApplicationId) {
    query._id = { $ne: excludeApplicationId };
  }

  const existing = await Application.findOne(query).select("_id").lean();
  return Boolean(existing);
}

async function scanGcashReceipt({ imageDataUrl, imageUrl, expectedAmount = null, excludeApplicationId = null }) {
  const ocrEnabled = Boolean(await getSystemSetting("ocrSpaceEnabled", true));
  if (!ocrEnabled) {
    return {
      ok: false,
      disabled: true,
      error: "OCR.space Receipt Scanner is currently disabled by administrator.",
    };
  }

  const { key: apiKey } = await getEffectiveOcrSpaceKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "OCR.space API key is not configured.",
    };
  }

  const cleanSource = String(imageDataUrl || imageUrl || "").trim();
  if (!cleanSource) {
    return { ok: false, error: "Receipt image data or URL is required." };
  }

  const isDataUrl = cleanSource.startsWith("data:image/");
  const payload = isDataUrl ? { imageDataUrl: cleanSource } : { imageUrl: cleanSource };

  let response = await callOcrSpace(apiKey, payload, "2");
  let parsedText = Array.isArray(response.data?.ParsedResults)
    ? response.data.ParsedResults.map((r) => r.ParsedText || "").join("\n").trim()
    : "";

  // Retry once with Engine 1 if Engine 2 errored or returned empty text
  if ((!response.ok || response.data?.IsErroredOnProcessing || !parsedText) && !String(response.data?.ErrorMessage || "").match(/invalid api key/i)) {
    const fallbackRes = await callOcrSpace(apiKey, payload, "1");
    const fallbackText = Array.isArray(fallbackRes.data?.ParsedResults)
      ? fallbackRes.data.ParsedResults.map((r) => r.ParsedText || "").join("\n").trim()
      : "";
    if (fallbackRes.ok && fallbackText) {
      response = fallbackRes;
      parsedText = fallbackText;
    }
  }

  if (!response.ok || !response.data || response.data.IsErroredOnProcessing) {
    const errMsg = Array.isArray(response.data?.ErrorMessage)
      ? response.data.ErrorMessage.join("; ")
      : response.data?.ErrorMessage || response.data?.error || "Failed to read text from receipt image.";
    return {
      ok: false,
      error: String(errMsg),
    };
  }

  const extracted = parseGcashText(parsedText, { expectedAmount });
  let isDuplicateReference = false;
  try {
    isDuplicateReference = await checkDuplicateReference(extracted.referenceNumber, excludeApplicationId);
  } catch {
    isDuplicateReference = false;
  }

  return {
    ok: true,
    extracted: {
      ...extracted,
      isDuplicateReference,
      scannedAt: new Date().toISOString(),
      source: "ocr.space",
    },
  };
}

module.exports = {
  parseGcashText,
  scanGcashReceipt,
  checkDuplicateReference,
};
