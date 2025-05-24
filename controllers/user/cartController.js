const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const mongoose = require("mongoose");
const Wishlist = require("../../models/wishlistSchema");
const Offer = require('../../models/offerSchema');

const findBestOffer = async (productId) => {
  try {
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return { offer: null, originalPrice: 0, discountedPrice: 0, discount: 0 };
    }

    const currentDate = new Date();
    const offers = await Offer.find({
      isListed: true,
      isDeleted: false,

      validFrom: { $lte: currentDate },
      validUpto: { $gte: currentDate },
      $or: [
        { offerType: 'product', applicableTo: productId },
        { offerType: 'category', applicableTo: product.category._id },
      ],
    });

    let bestOffer = null;
    let maxDiscount = 0;
    let discountedPrice = product.salePrice;

    for (const offer of offers) {
      let discount = 0;
      if (offer.discountType === 'percentage') {
        discount = (product.salePrice * offer.discountAmount) / 100;
      } else if (offer.discountType === 'fixed') {
        discount = offer.discountAmount;
      }

      if (discount > product.salePrice) {
        discount = product.salePrice;
      }

      if (discount > maxDiscount && product.salePrice >= offer.minPurchase) {
        maxDiscount = discount;
        bestOffer = offer;
        discountedPrice = product.salePrice - discount;
      }
    }

    return {
      offer: bestOffer ? {
        _id: bestOffer._id,
        code: bestOffer.code,
        discountType: bestOffer.discountType,
        discountAmount: bestOffer.discountAmount,
      } : null,
      originalPrice: product.salePrice,
      discountedPrice: discountedPrice < 0 ? 0 : discountedPrice,
      discount: maxDiscount,
    };
  } catch (error) {
    console.error('Error finding best offer:', error);
    return { offer: null, originalPrice: 0, discountedPrice: 0, discount: 0 };
  }
};

const loadCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    let cart = await Cart.findOne({ userId }).populate('items.productId');

    if (cart) {
      // Filter out invalid items
      cart.items = cart.items.filter(
        (item) =>
          item.productId &&
          !item.productId.isDeleted &&
          !item.productId.isBlocked &&
          item.productId.quantity >= item.quantity
      );

      let subtotal = 0;
      let totalDiscount = 0;

      for (const item of cart.items) {
        const { offer, originalPrice, discountedPrice, discount } = await findBestOffer(item.productId._id);

        item.price = originalPrice; // Original sale price
        item.discount = discount; // Non-negative discount per unit
        item.totalPrice = discountedPrice * item.quantity; // Total after discount
        item.offerId = offer ? offer._id : null;
        item.offerCode = offer ? offer.code : '';

        subtotal += originalPrice * item.quantity; // Subtotal uses original price
        totalDiscount += discount * item.quantity; // Sum of discounts
      }

      cart.subtotal = subtotal;
      cart.discount = totalDiscount; // Store as positive
      cart.shipping = cart.items.length > 0 ? 50 : 0;
      cart.total = cart.subtotal - cart.discount + cart.shipping; // Subtract positive discount

      await cart.save();
    }

    // Create a display version of discount for frontend
    const cartDisplay = cart ? {
      ...cart._doc,
      displayDiscount: cart.discount ? -cart.discount : 0 // Negative for frontend
    } : null;

    res.render('cart', {
      cart: cartDisplay,
      profilePicture: userData.profilePicture || null,
    });
  } catch (error) {
    console.error('Cannot render the cart page:', error);
    res.redirect('/pageNotFound');
  }
};

const addToCart = async (req, res) => {
  try {
    const { productId, quantity, offerId, offerCode, flag } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }


    const product = await Product.findById(productId).populate('category');
    if (!product || typeof product.salePrice !== "number") {
      return res.status(404).json({ success: false, message: "Product not found or price missing" });
    }
    if (product.quantity <= 0) {
      return res.status(400).json({ success: false, message: "Product is out of stock" });
    }

    let appliedOffer = null;
    let discount = 0;
    let discountedPrice = product.salePrice;

    if (offerId && offerCode) {
      const offer = await Offer.findById(offerId).lean();
      if (!offer || offer.code !== offerCode || !offer.isListed || offer.isDeleted) {
        return res.status(400).json({ success: false, message: "Invalid or inactive offer" });
      }

      const currentDate = new Date();
      if (offer.validFrom > currentDate || offer.validUpto < currentDate) {
        return res.status(400).json({ success: false, message: "Offer is not valid at this time" });
      }

      if (
        (offer.offerType === 'product' && offer.applicableTo.toString() !== productId) ||
        (offer.offerType === 'category' && offer.applicableTo.toString() !== product.category._id.toString())
      ) {
        return res.status(400).json({ success: false, message: "Offer is not applicable to this product" });
      }

      const totalPrice = product.salePrice * quantity;
      if (offer.minPurchase > totalPrice) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${offer.minPurchase} required for this offer`,
        });
      }

      if (offer.discountType === 'percentage') {
        discount = (product.salePrice * offer.discountAmount) / 100;
      } else {
        discount = offer.discountAmount;
      }
      if (discount > product.salePrice) {
        discount = product.salePrice;
      }
      discountedPrice = product.salePrice - discount;

      appliedOffer = {
        offerId: offer._id,
        offerCode: offer.code,
        discount,
      };
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], subtotal: 0 });
    }

    const existingItem = cart.items.find(
      (item) => item.productId.toString() === productId && (!item.offerId || item.offerId.toString() === offerId)
    );
    let totalDesiredQty = quantity;
    if (existingItem) {
      totalDesiredQty += existingItem.quantity;
    }
    if (totalDesiredQty > product.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantity} item(s) in stock. You already have ${
          existingItem?.quantity || 0
        } in cart.`,
      });
    }

    if (existingItem) {
      existingItem.quantity += quantity;
      existingItem.price = product.salePrice;
      existingItem.discount = appliedOffer ? appliedOffer.discount : 0;
      existingItem.totalPrice = discountedPrice * existingItem.quantity;
      if (appliedOffer) {
        existingItem.offerId = appliedOffer.offerId;
        existingItem.offerCode = appliedOffer.offerCode;
      } else {
        existingItem.offerId = null;
        existingItem.offerCode = '';
      }
    } else {
      const cartItem = {
        productId,
        quantity,
        price: product.salePrice,
        totalPrice: discountedPrice * quantity,
        discount: appliedOffer ? appliedOffer.discount : 0,
      };
      if (appliedOffer) {
        cartItem.offerId = appliedOffer.offerId;
        cartItem.offerCode = appliedOffer.offerCode;
      }
      cart.items.push(cartItem);
    }

    cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cart.discount = cart.items.reduce((sum, item) => sum + (item.discount * item.quantity), 0);
    cart.shipping = cart.items.length > 0 ? 50 : 0;
    cart.total = cart.subtotal - cart.discount + cart.shipping;

    await cart.save();

    if (flag === true) {
      await Wishlist.updateOne(
        { userId },
        { $pull: { products: { productId: productId } } },
        { new: true }
      );
    }

    return res.status(200).json({ 
      success: true, 
      message: "Product added to cart",
      cart: {
        ...cart._doc,
        displayDiscount: cart.discount ? -cart.discount : 0 // Negative for frontend
      }
    });
  } catch (error) {
    console.error("Error while adding to cart:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const updateCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { updates } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid updates array' });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const errors = [];
    updates.forEach((update) => {
      if (!mongoose.Types.ObjectId.isValid(update.productId)) {
        errors.push({
          productId: update.productId,
          message: 'Invalid product ID',
        });
        return;
      }

      const item = cart.items.find(
        (i) => i.productId._id.toString() === update.productId
      );
      if (!item) {
        errors.push({
          productId: update.productId,
          message: 'Product not found in cart',
        });
        return;
      }

      if (item.productId.quantity < update.quantity) {
        errors.push({
          productId: update.productId,
          message: `Only ${item.productId.quantity} items available in stock for ${item.productId.productName}`,
        });
      } else if (update.quantity < 1) {
        errors.push({
          productId: update.productId,
          message: `Quantity must be at least 1 for ${item.productId.productName}`,
        });
      } else {
        item.quantity = update.quantity;
      }
    });

    if (errors.length > 0) {
      return res.json({ success: false, message: 'Cart update failed', errors });
    }

    let subtotal = 0;
    let totalDiscount = 0;

    for (const item of cart.items) {
      if (item.productId && !item.productId.isDeleted && !item.productId.isBlocked) {
        const { offer, originalPrice, discountedPrice, discount } = await findBestOffer(item.productId._id);

        if (discountedPrice === null || isNaN(discountedPrice)) {
          errors.push({
            productId: item.productId._id,
            message: 'Error calculating offer price',
          });
          continue;
        }

        item.price = originalPrice;
        item.discount = discount;
        item.totalPrice = discountedPrice * item.quantity;
        item.offerId = offer ? offer._id : null;
        item.offerCode = offer ? offer.code : '';

        subtotal += originalPrice * item.quantity;
        totalDiscount += discount * item.quantity;
      }
    }

    if (errors.length > 0) {
      return res.json({ success: false, message: 'Cart update failed', errors });
    }

    cart.subtotal = subtotal;
    cart.discount = totalDiscount;
    cart.shipping = cart.items.length > 0 ? 50 : 0;
    cart.total = cart.subtotal - cart.discount + cart.shipping;

    await cart.save();

    return res.json({ 
      success: true, 
      cart: {
        ...cart._doc,
        displayDiscount: cart.discount ? -cart.discount : 0 // Negative for frontend
      }
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const initialItemCount = cart.items.length;
    cart.items = cart.items.filter(
      (item) => item.productId._id.toString() !== productId
    );

    if (cart.items.length === initialItemCount) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    let subtotal = 0;
    let totalDiscount = 0;

    for (const item of cart.items) {
      subtotal += item.price * item.quantity;
      totalDiscount += item.discount * item.quantity;
    }

    cart.subtotal = subtotal;
    cart.discount = totalDiscount;
    cart.shipping = cart.items.length > 0 ? 50 : 0;
    cart.total = cart.subtotal - cart.discount + cart.shipping;

    await cart.save();

    return res.status(200).json({ 
      success: true, 
      message: "Item removed successfully", 
      cart: {
        ...cart._doc,
        displayDiscount: cart.discount ? -cart.discount : 0 // Negative for frontend
      }
    });
  } catch (error) {
    console.error("Error removing item from cart:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


module.exports = {
  loadCart,
  addToCart,
  updateCart,
  removeFromCart,
};