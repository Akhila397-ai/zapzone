const { status } = require('init');
const mongoose = require('mongoose');
const { Schema } = mongoose;


const generateOrderId = () => {
  const randomNum = Math.floor(10000000 + Math.random() * 90000000); // 8-digit random number
  return `ZZ-ORD-${randomNum}`;
};

const orderSchema = new Schema({
  orderId: {
    type: String,
    default: generateOrderId,
    unique: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderedItems: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: "product",
      required: true,
  
    },
    quantity: {
      type: Number,
      required: true
    },
    price: {
      type: Number,
      default: 0
    },
   status: {
  type: String,
  enum: ["pending", "Cancelled","Failed", "Return Requested", "Returned", "Return Rejected","processing"],
  default: "pending"
}
  }],
  totalPrice: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    required: true
  },
  address: {
    type: Schema.Types.ObjectId,
    ref: "Address", 
    required: true
  },
  reason:{
    type:String
  },
  returnReason:{
    type:String
  },
  invoiceDate: {
    type: Date
  },
  status: {
    type: String,
    required: true,
    enum: ["pending", "processing","Shipped","Failed" ,"Delivered", "Cancelled", "Return Requested", "Returned","Return Rejected"]
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true
  },
  couponApplied: {
    type: Boolean,
    default: false 
  },
   razorpayOrderId: {
    type: String
  },
  razorpayPaymentId: {
    type: String
  },
  razorpaySignature: {
    type: String
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['COD', 'Razorpay', 'Wallet'],
    default: 'COD'
  },
  paymentStatus: {
  type: String,
  enum: ['Pending', 'Paid', 'Failed', 'Cancelled'],
  default: 'Pending'
},

  
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
