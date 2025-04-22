const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    brand: {
      type: Schema.Types.ObjectId,
      required: false,
      ref:'Brand'
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "category",
      required: true,
      
    },
    ram:{
      type:Schema.Types.ObjectId,
      ref:"ram",
      required:true,
      enum: ["4GB", "8GB", "16GB", "32GB", "64GB"]
    },
    storage:{
      type:Schema.Types.ObjectId,
      ref:"storage",
      required:true
    },
    processor:{
      type:Schema.Types.ObjectId,
      ref:"processor",
      required:true
    },
    regularPrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },
    productOffer: {
      type: Number,
      default: 0,
    },
    quantity: {
      type: Number,
      default: 0, 
    },
    color: {
      type: String,
      required: false,
    },
    productImage: {
      type: [String],
      required: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isDeleted:{
      type:Boolean,
      default:false
    },
    status: {
      type: String,
      enum: ['Available', 'Out of Stock'],
      default: 'Available'
    },
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
