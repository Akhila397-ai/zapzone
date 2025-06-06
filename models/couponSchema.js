const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
    default: 'percentage',
  },
  discountAmount: {
    type: Number,
    required: true,
  },
  minOrderAmount: {
    type: Number,
    default: 0,
  },

 maxDiscount: {
    type: Number,
    min: [0, 'Maximum discount cannot be negative'],
    default: null, // Optional for fixed discounts, required for percentage
  },
  validFrom: {
    type: Date,
    required: true,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  usageLimit: {
    type: Number,
    default: 10,
  },
  usedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
}, { timestamps: true });

const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;