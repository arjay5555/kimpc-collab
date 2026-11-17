/**
 * Client-side mirror of canonical booking payment & refund calculations.
 * Consumes backend financialSummary when present and computes identically from live fields.
 */

const clean = (value) => String(value ?? "").trim();

export function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function hasConfirmedLegacyPayment(app) {
  const history = Array.isArray(app?.paymentHistory) ? app.paymentHistory : [];
  if (history.length > 0) return false;

  const dbPayStatus = clean(app?.paymentStatus).toLowerCase();
  const hasPaidFlag =
    ["paid", "settled", "partial", "partially refunded", "refunded"].includes(dbPayStatus) ||
    Boolean(app?.financials?.isSettled);

  if (!hasPaidFlag) return false;

  const recordedAmt = Number(app?.financials?.totalPaid ?? app?.paymentAmount ?? 0) || 0;
  if (recordedAmt <= 0 && !["paid", "settled"].includes(dbPayStatus)) return false;

  return (
    Boolean(clean(app?.receivedBy)) ||
    Boolean(clean(app?.paymentDateTime)) ||
    (Boolean(app?.isWalkIn) && Boolean(app?.financials?.isSettled))
  );
}

export function computePaymentSummary(app) {
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

  const balanceDue = isClosedBooking
    ? Math.max(0, round2(cancellationFee - grossPaid))
    : Math.max(0, round2(rentalCharge - netCollected));
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
        paymentStatus = rentalCharge > 0 && grossPaid >= rentalCharge ? "Paid" : "Partially Paid";
      }
    } else if (balanceDue <= 0 && rentalCharge > 0) {
      paymentStatus = "Paid";
    } else {
      paymentStatus = "Partially Paid";
    }
  } else if (isClosedBooking) {
    paymentStatus = cancellationFee > 0 ? "Unpaid" : "No Balance";
  }

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
    needsRefundDecision:
      isClosedBooking &&
      grossPaid > 0 &&
      totalRefunded === 0 &&
      refundDetermination !== "refund_due" &&
      refundDetermination !== "no_refund",
    canRecordPayment: maxPayableAmount > 0,
    canRecordRefund:
      grossPaid > 0 &&
      !hasFlaggedPayments &&
      refundableRemaining > 0,
  };
}
