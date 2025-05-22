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
    ram: { 
      type: String, 
      required: true, 
      enum: ['4GB', '8GB', '16GB', '32GB', '64GB'] 
    },
    storage: { 
      type: String, 
      required: true, 
      enum: ['128GB SSD', '256GB SSD', '512GB SSD', '1TB SSD', '2TB SSD', '1TB HDD'] 
    },
    processor: { 
      type: String, 
      required: true, 
      enum: ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 5', 'AMD Ryzen 7', 'AMD Ryzen 9'] 
    },
    color: { 
      type: String, 
      required: true,
      match: /^[a-zA-Z\s]+$/ 
    },
    regularPrice: {
      type: Number,
      required: false,
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

const Product = mongoose.model("product", productSchema);

module.exports = Product;
