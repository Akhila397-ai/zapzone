const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    profilePicture: {
        type: String
    },
    phone: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        default: "",
        trim: true
    },
    googleId: {
        type: String,
        unique: true,
        required: false,
        sparse: true
    },
    password: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: "Cart"
    }],
    wallet: {
        type: Number,
        default: 0
    },
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: "Order"
    }],
    createdOn: {
        type: Date,
        default: Date.now
    },
    referralCode: { 
    type: String,
    unique: true
  },
    walletTransactions: [
  {
    amount: Number,
    type: { type: String, enum: ["Credit", "Debit"] },
    description: String,
    date: { type: Date, default: Date.now },
  }
],
    redeemed: {
        type: Boolean
    },
    redeemedUsers: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category"
        },
        brand: {
            type: String
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }]
});


const User = mongoose.model("User", userSchema);

module.exports = User;
