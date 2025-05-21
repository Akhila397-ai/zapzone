const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId,
     ref: 'User',
      required: true
     },
  type: {
     type: String,
     enum: ['CREDIT', 'DEBIT'], 
     required: true
     },
  amount: { 
    type: Number, 
    required: true 
},
  reason: {
     type: String,
     required: true
     },
  balanceAfter: { 
    type: Number, 
    required: true 
},
  createdAt: { 
    type: Date,
    default: Date.now 
}
});

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;