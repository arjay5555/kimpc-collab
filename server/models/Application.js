const mongoose = require("mongoose");
const { computePaymentSummary } = require("../utils/paymentSummary");

// One document per equipment rental request.
const applicationSchema = new mongoose.Schema(
  {
    memberEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    memberName: { type: String, required: true, trim: true },
    equipment: { type: String, required: true, trim: true },
    machineryUnitId: { type: String, default: "", trim: true, index: true },
    startDate: { type: String, required: true }, // "YYYY-MM-DD", straight from <input type="date">
    endDate: { type: String, required: true },
    bookingType: { type: String, enum: ["hectare", "daily", "hourly"], default: "hectare" },
    hectares: { type: Number, default: 1, min: 0.1 },
    ratePerHectare: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    farmLocation: { type: String, default: "", trim: true, maxlength: 500 },
    farmCoordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    farmFormattedAddress: { type: String, default: "", trim: true },
    machineryModel: { type: String, default: "", trim: true },
    imageUrl: { type: String, default: "" },
    clientAvatar: { type: String, default: "" },
    assignedDriver: { type: String, default: "Self-Operated", trim: true },
    driverPhone: { type: String, default: "", trim: true },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Pending", "Partial", "Settled", "Refunded", "Refund Pending", "Partially Refunded", "No Balance"],
      default: "Pending",
    },
    paymentAmount: { type: Number, default: 0 },
    paymentMethod: { type: String, default: "Cash" },
    cashPaymentOption: { type: String, default: "" },
    gcashProof: { type: String, default: "" },
    receiptNo: { type: String, default: "" },
    paymentReference: { type: String, default: "" },
    paymentDateTime: { type: String, default: "" },
    receivedBy: { type: String, default: "" },
    paymentHistory: [
      {
        receiptNo: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        paymentMethod: { type: String, default: "Cash" },
        paymentType: { type: String, default: "Rental Payment" },
        referenceNumber: { type: String, default: "" },
        dateTime: { type: String, default: "" },
        receivedBy: { type: String, default: "" },
        proofOfPayment: { type: String, default: "" },
        notes: { type: String, default: "" },
        idempotencyKey: { type: String, default: "" },
        recordedAt: { type: Date, default: Date.now },
        flaggedForReview: { type: Boolean, default: false },
        reviewStatus: {
          type: String,
          enum: ["none", "pending_review", "confirmed_received", "voided"],
          default: "none",
        },
        reviewedBy: { type: String, default: "" },
        reviewedAt: { type: Date, default: null },
        reviewNote: { type: String, default: "" },
        linkedRefundReviewNote: { type: String, default: "" },
        isVoided: { type: Boolean, default: false },
        voidedAt: { type: Date, default: null },
        voidedBy: { type: String, default: "" },
        voidReason: { type: String, default: "" },
      },
    ],
    refunds: [
      {
        refundNo: { type: String, default: "" },
        linkedPaymentId: { type: String, default: "" },
        linkedReceiptNo: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        refundDate: { type: String, default: "" },
        reason: { type: String, default: "" },
        referenceNumber: { type: String, default: "" },
        paymentMethod: { type: String, default: "Cash" },
        recordedBy: { type: String, default: "" },
        recordedAt: { type: Date, default: Date.now },
        notes: { type: String, default: "" },
        idempotencyKey: { type: String, default: "" },
      },
    ],
    isVoidedBooking: { type: Boolean, default: false },
    bookingVoidedAt: { type: Date, default: null },
    bookingVoidedBy: { type: String, default: "" },
    bookingVoidReason: { type: String, default: "" },
    cancellationFee: { type: Number, default: 0, min: 0 },
    refundDetermination: {
      type: String,
      enum: ["not_applicable", "pending_review", "refund_due", "no_refund"],
      default: "not_applicable",
    },
    refundDecisionNote: { type: String, default: "" },
    refundDecidedBy: { type: String, default: "" },
    refundDecidedAt: { type: Date, default: null },
    processedRequestIds: { type: [String], default: [] },
    approvedAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    rescheduledAt: { type: Date, default: null },
    rescheduleHistory: [
      {
        previousStartDate: { type: String },
        previousEndDate: { type: String },
        newStartDate: { type: String },
        newEndDate: { type: String },
        rescheduledAt: { type: Date, default: Date.now },
        reason: { type: String, default: "" },
      }
    ],
    timeline: [
      {
        event: { type: String },
        title: { type: String },
        timestamp: { type: Date, default: Date.now },
        actor: { type: String, default: "Member" },
        note: { type: String, default: "" },
      }
    ],
    status: { 
      type: String, 
      enum: ["Pending", "Approved", "Checked-Out", "Returned", "Rejected", "Cancelled", "Cancellation Requested"], 
      default: "Pending",
      index: true 
    },
    cancellationRequested: { type: Boolean, default: false },
    cancellationReason: { type: String, default: "" },
    cancellationRequestedAt: { type: Date, default: null },
    managerRemarks: { type: String, default: "", trim: true },
    isWalkIn: { type: Boolean, default: false },
    farmerPhone: { type: String, default: "" },
    memberPhone: { type: String, default: "" },
    clientPhone: { type: String, default: "" },
    checkoutInspection: {
      odometerHours: { type: Number, default: 0 },
      fuelLevel: { type: String, default: "100%" },
      notes: { type: String, default: "" },
      photoCount: { type: Number, default: 0 },
      inspectedAt: { type: Date }
    },
    checkinInspection: {
      odometerHours: { type: Number, default: 0 },
      fuelLevel: { type: String, default: "100%" },
      notes: { type: String, default: "" },
      photoCount: { type: Number, default: 0 },
      inspectedAt: { type: Date }
    },
    financials: {
      dailyRate: { type: Number, default: 0 },
      ratePerHectare: { type: Number, default: 0 },
      hectares: { type: Number, default: 1 },
      deposit: { type: Number, default: 0 },
      lateFee: { type: Number, default: 0 },
      repairDeduction: { type: Number, default: 0 },
      fuelCharge: { type: Number, default: 0 },
      totalPaid: { type: Number, default: 0 },
      refundAmount: { type: Number, default: 0 },
      paymentMethod: { type: String, default: "Cash" },
      isSettled: { type: Boolean, default: false }
    },
    // Google Calendar 2-Way Synchronization
    googleCalendarEventId: { type: String, default: "", index: true }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        ret.displayId = `APP-${ret.id.slice(-6).toUpperCase()}`;
        ret.submittedAt = ret.createdAt ? ret.createdAt.toISOString() : new Date().toISOString();
        ret.financialSummary = computePaymentSummary(ret);
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

module.exports = mongoose.model("Application", applicationSchema);
