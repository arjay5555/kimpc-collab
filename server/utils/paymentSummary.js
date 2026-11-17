/**
 * Canonical booking financial & payment summary computation shared across backend routes and models.
 * Keeps booking lifecycle status strictly separated from financial payment/refund status.
 */

const clean = (value) => String(value ?? "").trim();

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Determine if a legacy application (no paymentHistory array entries yet) has a genuine
 * manager-verified payment vs an old booking submission that defaulted to Pending/auto-Paid.
 */
function hasConfirmedLegacyPayment(app) {
  const history = Array.isArray(app?.paymentHistory) ? app.paymentHistory : [];
  if (history.length > 0) return false;

  const dbPayStatus = clean(app?.paymentStatus).toLowerCase();
  const hasPaidFlag =
    ["paid", "settled", "partial", "partially refunded", "refunded"].includes(dbPayStatus) ||
    Boolean(app?.financials?.isSettled);

  if (!hasPaidFlag) return false;

  const recordedAmt = Number(app?.financials?.totalPaid ?? app?.paymentAmount ?? 0) || 0;
  if (recordedAmt <= 0 && !["paid", "settled"].includes(dbPayStatus)) return false;

  // Guard against old auto-GCash bug where paymentStatus was marked Paid at booking time
  // without a paymentHistory entry, receiver name, payment date/time, or POS walk-in confirmation.
  const hasManagerEvidence =
    Boolean(clean(app?.receivedBy)) ||
    Boolean(clean(app?.paymentDateTime)) ||
    (Boolean(app?.isWalkIn) && Boolean(app?.financials?.isSettled));

  return hasManagerEvidence;
}

/**
 * Compute authoritative payment, balance, refund, and review figures for an Application record.
 * Never mutates the input object.
 */
function computePaymentSummary(app) {
  const doc = app || {};
  const rawBookingStatus = clean(doc.status) || "Pending";
  const bookingStatusLower = rawBookingStatus.toLowerCase();
  const isVoidedBooking = Boolean(doc.isVoidedBooking);
  const isCancelled = bookingStatusLower === "cancelled" || isVoidedBooking;
  const isRejected = bookingStatusLower === "rejected";
  const isClosedBooking = isCancelled || isRejected;
  const bookingStatus = isVoidedBooking ? "Voided" : rawBookingStatus;

  const hectares = Math.max(0.1, Number(doc.hectares) || 1);
  const rate =
    Number(doc.ratePerHectare) ||
    Number(doc.financials?.ratePerHectare) ||
    Number(doc.financials?.dailyRate) ||
    0;
  const explicitTotal = Number(doc.totalAmount);
  const baseRentalCharge =
    Number.isFinite(explicitTotal) && explicitTotal > 0
      ? round2(explicitTotal)
      : rate > 0
      ? round2(rate * hectares)
      : 0;

  const lateFee = Math.max(0, round2(doc.financials?.lateFee));
  const repairDeduction = Math.max(0, round2(doc.financials?.repairDeduction));
  const fuelCharge = Math.max(0, round2(doc.financials?.fuelCharge));
  const extraFees = round2(lateFee + repairDeduction + fuelCharge);
  const rentalCharge = round2(baseRentalCharge + extraFees);

  const cancellationFee = isCancelled ? Math.max(0, round2(doc.cancellationFee)) : 0;
  const applicableCharge = isClosedBooking ? cancellationFee : rentalCharge;

  const rawHistory = Array.isArray(doc.paymentHistory) ? doc.paymentHistory : [];
  const activePayments = rawHistory.filter((entry) => !entry?.isVoided);
  const voidedPayments = rawHistory.filter((entry) => Boolean(entry?.isVoided));

  let grossPaid = 0;
  if (rawHistory.length > 0) {
    grossPaid = round2(
      activePayments.reduce((sum, entry) => sum + Math.max(0, Number(entry?.amount) || 0), 0)
    );
  } else if (hasConfirmedLegacyPayment(doc)) {
    const dbPayStatus = clean(doc.paymentStatus).toLowerCase();
    grossPaid =
      dbPayStatus === "partial"
        ? round2(Number(doc.financials?.totalPaid ?? doc.paymentAmount ?? 0))
        : round2(Number(doc.financials?.totalPaid || doc.paymentAmount || rentalCharge));
  }

  const refunds = Array.isArray(doc.refunds) ? doc.refunds : [];
  const totalRefunded =
    refunds.length > 0
      ? round2(refunds.reduce((sum, r) => sum + Math.max(0, Number(r?.amount) || 0), 0))
      : Math.min(grossPaid, Math.max(0, round2(doc.financials?.refundAmount)));

  const netCollected = Math.max(0, round2(grossPaid - totalRefunded));

  const flaggedPayments = activePayments.filter(
    (entry) => Boolean(entry?.flaggedForReview) && clean(entry?.reviewStatus) === "pending_review"
  );
  const hasFlaggedPayments = flaggedPayments.length > 0;

  const validDeterminations = new Set(["not_applicable", "pending_review", "refund_due", "no_refund"]);
  let refundDetermination = clean(doc.refundDetermination);
  if (
    !validDeterminations.has(refundDetermination) ||
    (isClosedBooking && grossPaid > 0 && refundDetermination === "not_applicable")
  ) {
    refundDetermination = isClosedBooking && grossPaid > 0 ? "pending_review" : "not_applicable";
  }

  const refundableCap = isClosedBooking
    ? Math.max(0, round2(grossPaid - cancellationFee))
    : grossPaid;
  const refundableRemaining = Math.max(0, round2(refundableCap - totalRefunded));
  const refundDueRemaining =
    refundDetermination === "refund_due" ? refundableRemaining : 0;

  let balanceDue = 0;
  if (isClosedBooking) {
    balanceDue = Math.max(0, round2(cancellationFee - grossPaid));
  } else {
    balanceDue = Math.max(0, round2(rentalCharge - netCollected));
  }
  const maxPayableAmount = isClosedBooking
    ? Math.max(0, round2(Math.max(rentalCharge, cancellationFee) - netCollected))
    : balanceDue;

  let paymentStatus = "Unpaid";
  if (grossPaid > 0) {
    if (totalRefunded >= grossPaid) {
      paymentStatus = "Fully Refunded";
    } else if (totalRefunded > 0) {
      paymentStatus = "Partially Refunded";
    } else if (isClosedBooking) {
      if (refundDetermination === "refund_due" && refundableCap > 0) {
        paymentStatus = "Refund Pending";
      } else {
        // Keep original payment collection status until KIMPC explicitly marks refund due
        paymentStatus = rentalCharge > 0 && grossPaid >= rentalCharge ? "Paid" : "Partially Paid";
      }
    } else if (balanceDue <= 0 && rentalCharge > 0) {
      paymentStatus = "Paid";
    } else {
      paymentStatus = "Partially Paid";
    }
  } else if (isClosedBooking) {
    paymentStatus = cancellationFee > 0 ? "Unpaid" : "No Balance";
  } else {
    paymentStatus = "Unpaid";
  }

  const needsRefundDecision =
    isClosedBooking &&
    grossPaid > 0 &&
    totalRefunded === 0 &&
    refundDetermination !== "refund_due" &&
    refundDetermination !== "no_refund";

  const canRecordPayment = maxPayableAmount > 0;

  const canRecordRefund =
    grossPaid > 0 &&
    !hasFlaggedPayments &&
    refundableRemaining > 0;

  return {
    bookingStatus,
    rawBookingStatus,
    isVoidedBooking,
    isCancelled,
    isRejected,
    isClosedBooking,
    baseRentalCharge,
    extraFees,
    rentalCharge,
    cancellationFee,
    applicableCharge,
    grossPaid,
    totalRefunded,
    netCollected,
    balanceDue,
    maxPayableAmount,
    refundableCap,
    refundableRemaining,
    refundDueRemaining,
    refundDetermination,
    paymentStatus,
    activePaymentCount: activePayments.length,
    voidedPaymentCount: voidedPayments.length,
    refundCount: refunds.length,
    flaggedPaymentCount: flaggedPayments.length,
    hasFlaggedPayments,
    needsRefundDecision,
    canRecordPayment,
    canRecordRefund,
  };
}

/**
 * Map canonical paymentStatus label to the persisted Application.paymentStatus field
 * for compatibility with MongoDB queries, reports, and Member views.
 */
function getPersistedPaymentStatus(summary) {
  switch (summary.paymentStatus) {
    case "Paid":
      return "Paid";
    case "Partially Paid":
      return "Partial";
    case "Fully Refunded":
      return "Refunded";
    case "Partially Refunded":
      return "Partially Refunded";
    case "Refund Pending":
      return "Refund Pending";
    case "No Balance":
      return "No Balance";
    case "Unpaid":
    default:
      return "Pending";
  }
}

/**
 * Synchronize Application document financial snapshot fields with paymentHistory & refunds.
 */
function syncApplicationFinancials(existing) {
  if (!existing.financials) existing.financials = {};
  const summary = computePaymentSummary(existing);

  existing.paymentStatus = getPersistedPaymentStatus(summary);
  existing.paymentAmount = summary.grossPaid;
  existing.financials.totalPaid = summary.grossPaid;
  existing.financials.refundAmount = summary.totalRefunded;
  existing.financials.isSettled = summary.paymentStatus === "Paid";

  const activeEntries = (existing.paymentHistory || []).filter((entry) => !entry.isVoided);
  const latestActive = activeEntries.length > 0 ? activeEntries[activeEntries.length - 1] : null;
  if (latestActive) {
    existing.receiptNo = latestActive.receiptNo || existing.receiptNo;
    existing.paymentMethod = latestActive.paymentMethod || existing.paymentMethod;
    existing.financials.paymentMethod = existing.paymentMethod;
    existing.paymentReference = latestActive.referenceNumber || "";
    existing.paymentDateTime = latestActive.dateTime || "";
    existing.receivedBy = latestActive.receivedBy || existing.receivedBy;
  } else if (Array.isArray(existing.paymentHistory) && existing.paymentHistory.length > 0) {
    existing.paymentReference = "";
    existing.paymentDateTime = "";
    existing.receivedBy = "";
  }

  return summary;
}

/**
 * Apply cancellation or voiding financial preservation rules without deleting payments or history.
 * - Preserves original payments, refunds, and timeline.
 * - Closes unpaid balance when zero payments collected and no cancellation fee applies.
 * - Leaves refundPending OFF until KIMPC determines refund is due.
 * - If booking was voided by a manager, flags active payments for manager review.
 */
function applyCancellationFinancialEffects(existing, { isVoid = false, reason = "", actorName = "Manager", nowTs = new Date() } = {}) {
  if (!Array.isArray(existing.paymentHistory)) existing.paymentHistory = [];
  if (!Array.isArray(existing.refunds)) existing.refunds = [];
  if (!Array.isArray(existing.timeline)) existing.timeline = [];

  if (isVoid) {
    existing.isVoidedBooking = true;
    existing.bookingVoidedAt = nowTs;
    existing.bookingVoidedBy = actorName;
    existing.bookingVoidReason = clean(reason) || "Voided by manager";

    // Materialize legacy paid entry if old record lacked paymentHistory so it can be reviewed/voided
    if (existing.paymentHistory.length === 0 && hasConfirmedLegacyPayment(existing)) {
      const legacySummary = computePaymentSummary(existing);
      if (legacySummary.grossPaid > 0) {
        existing.paymentHistory.push({
          receiptNo:
            clean(existing.receiptNo) ||
            `OR-${nowTs.getFullYear()}-${String(existing._id).slice(-4).toUpperCase()}`,
          amount: legacySummary.grossPaid,
          paymentMethod: existing.paymentMethod || "Cash",
          referenceNumber: existing.paymentReference || "",
          dateTime: existing.paymentDateTime || (existing.createdAt ? existing.createdAt.toISOString() : nowTs.toISOString()),
          receivedBy: existing.receivedBy || "System",
          recordedAt: existing.createdAt || nowTs,
          paymentType: "Legacy Recorded Payment",
          flaggedForReview: true,
          reviewStatus: "pending_review",
        });
      }
    }

    let flaggedCount = 0;
    existing.paymentHistory.forEach((entry) => {
      if (!entry.isVoided) {
        entry.flaggedForReview = true;
        if (clean(entry.reviewStatus) !== "confirmed_received") {
          entry.reviewStatus = "pending_review";
        }
        flaggedCount++;
      }
    });

    if (flaggedCount > 0) {
      existing.timeline.push({
        event: "payment_review_flagged",
        title: "Linked Payments Flagged for Review",
        timestamp: nowTs,
        actor: actorName,
        note: `${flaggedCount} linked payment entr${flaggedCount === 1 ? "y was" : "ies were"} flagged for manager confirmation following booking void.`,
      });
    }
  }

  const preSummary = computePaymentSummary(existing);
  if (preSummary.grossPaid > 0) {
    if (!existing.refundDetermination || existing.refundDetermination === "not_applicable") {
      existing.refundDetermination = "pending_review";
    }
  } else {
    existing.refundDetermination = "not_applicable";
  }

  return syncApplicationFinancials(existing);
}

/**
 * Find any refunds linked to a given payment entry subdocument.
 */
function findLinkedRefundsForPayment(existing, paymentEntry) {
  const refunds = Array.isArray(existing?.refunds) ? existing.refunds : [];
  if (!paymentEntry || refunds.length === 0) return [];
  const entryId = clean(paymentEntry._id || paymentEntry.id);
  const receiptNo = clean(paymentEntry.receiptNo);
  return refunds.filter((r) => {
    const linkedId = clean(r?.linkedPaymentId);
    const linkedOr = clean(r?.linkedReceiptNo);
    if (entryId && linkedId && linkedId === entryId) return true;
    if (!linkedId && receiptNo && linkedOr && linkedOr === receiptNo) return true;
    return false;
  });
}

module.exports = {
  round2,
  hasConfirmedLegacyPayment,
  computePaymentSummary,
  getPersistedPaymentStatus,
  syncApplicationFinancials,
  applyCancellationFinancialEffects,
  findLinkedRefundsForPayment,
};

