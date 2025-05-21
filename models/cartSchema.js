const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  items: [
    {
      productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
      },
      quantity: {
        type: Number,
        required: true, // Changed from default: "" to ensure a number
        min: 1,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
      totalPrice: {
        type: Number,
        required: true,
        min: 0,
      },
      offerId: {
        type: Schema.Types.ObjectId,
        ref: 'Offer',
        default: null, // To store the applied offer (if any)
      },
      offerCode: {
        type: String,
        trim: true,
        default: '', // To store the offer code (e.g., "SUMMER10")
      },
      discount: {
        type: Number,
        default: 0, // Discount applied to this item
        min: '',
      },
      status: {
        type: String,
        default: 'placed',
      },
      cancellationReason: {
        type: String,
        default: 'none',
      },
    },
  ],
  subtotal: {
    type: Number,
    default: 0,
    min: 0,
  },
  coupon:{
    code:{type:String}, discount:{type:Number}
  },
  discount: {
    type: Number,
    default: 0, // Total offer discount for the cart
    min: 0,
  },
  shipping: {
    type: Number,
    default: 50, // Default shipping cost as per cart.ejs
    min: 0,
  },
  total: {
    type: Number,
    default: 0, // Total after discount and shipping
    min: 0,
  },
});

const Cart = mongoose.model('Cart', cartSchema); // Model name capitalized for convention
module.exports = Cart;