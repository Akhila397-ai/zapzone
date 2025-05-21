const mongoose = require('mongoose');
const { Schema } = mongoose;

const offerSchema = new Schema({
  offerName: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
  },
  discountAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  validFrom: {
    type: Date,
    required: true,
  },
  validUpto: {
    type: Date,
    required: true,
  },
  offerType: {
    type: String,
    enum: ['category', 'product'],
    required: true,
    ref:''
  },
  applicableTo: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'offerTypeRef',
  },
  offerTypeRef: {
    type: String,
    required: true,
    enum: ['category', 'product'],
  
  },
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  minPurchase: {
    type: Number,
    required: true,
    min: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isListed: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
});

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;