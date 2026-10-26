const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    txId: { type: String, required: true, unique: true, index: true },
    time: { type: String, default: "" },
    farmer: { type: String, required: true, trim: true },
    equipment: { type: String, required: true, trim: true },
    type: { 
      type: String, 
      enum: ["Rental Fee", "Deposit", "Late Fee", "Damage Charge", "Deposit Refund"],
      required: true,
      index: true
    },
    amount: { type: Number, required: true },
    paymentMethod: { 
      type: String, 
      enum: ["Cash", "Bank Transfer", "Co-op Credit"],
      default: "Cash" 
    },
    status: { type: String, default: "Completed" },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

transactionSchema.index({ createdAt: 1, status: 1, type: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
