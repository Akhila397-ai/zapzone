const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");
const Offer = require("../../models/offerSchema");
const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { v4: uuidv4 } = require('uuid');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Function to find the best offer for a product
const findBestOffer = async (productId) => {
  try {
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      console.warn(`Product not found for ID: ${productId}`);
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
        discountedPrice = Math.max(0, product.salePrice - discount);
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
      discountedPrice,
      discount: maxDiscount,
    };
  } catch (error) {
    console.error(`Error finding best offer for product ${productId}:`, error);
    return { offer: null, originalPrice: 0, discountedPrice: 0, discount: 0 };
  }
};

const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const userData = await User.findById(userId);
    let cartItems = [];
    let subtotal = 0;
    let offerDiscount = 0;
    let couponDiscount = 0;
    let total = 0;
    let addresses = [];
    let order = null;
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (req.query.orderId) {
      order = await Order.findOne({ orderId: req.query.orderId }).populate('orderedItems.product');
      if (order && order.user.toString() === userId.toString() && ['Pending', 'Failed'].includes(order.paymentStatus)) {
        cartItems = order.orderedItems.map(item => ({
          productId: item.product,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount || 0,
          totalPrice: item.totalPrice || item.price * item.quantity,
          offerId: item.offerId || null,
          offerCode: item.offerCode || '',
          offerName:item.offerName,
        }));
        subtotal = order.totalPrice;
        offerDiscount = order.orderedItems.reduce((sum, item) => sum + (item.discount || 0) * item.quantity, 0);
        couponDiscount = order.discount || 0;
        total = order.finalAmount;
      } else {
        console.warn(`Invalid order or unauthorized access: orderId=${req.query.orderId}, userId=${userId}`);
        return res.redirect('/pageNotFound');
      }
    } else {
      
      if (cart) {
        // Filter out invalid items
        cart.items = cart.items.filter(
          (item) =>
            item.productId &&
            !item.productId.isDeleted &&
            !item.productId.isBlocked &&
            item.productId.quantity >= item.quantity
        );

        // Calculate offer discounts for each item
        cartItems = [];
        for (const item of cart.items) {
          const { offer, originalPrice, discountedPrice, discount } = await findBestOffer(item.productId._id);
          cartItems.push({
            productId: item.productId,
            quantity: item.quantity,
            price: originalPrice,
            discount,
            totalPrice: Math.max(0, discountedPrice * item.quantity),
            offerId: offer ? offer._id : null,
            offerCode: offer ? offer.code : '',
          });
        }

        subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        offerDiscount = cartItems.reduce((sum, item) => sum + item.discount * item.quantity, 0);
        couponDiscount = cart.coupon?.discount || 0;

        const shippingCharge = cart.items.length > 0 ? 50 : 0;
        total = subtotal - offerDiscount - couponDiscount + shippingCharge;

        // Ensure total is non-negative
        if (total < 0) {
          console.warn(`Negative total detected: subtotal=${subtotal}, offerDiscount=${offerDiscount}, couponDiscount=${couponDiscount}, shipping=${shippingCharge}`);
          total = Math.max(0, total);
          offerDiscount = Math.min(offerDiscount, subtotal); // Cap offerDiscount to prevent negative total
          couponDiscount = Math.min(couponDiscount, subtotal - offerDiscount); // Cap couponDiscount
        }

        // Update cart with new calculations
        cart.subtotal = subtotal;
        cart.discount = offerDiscount + couponDiscount;
        cart.shipping = shippingCharge;
        cart.total = total;
        await cart.save();
      }
    }

    const addressDoc = await Address.findOne({ userId });
    addresses = addressDoc ? addressDoc.address : [];

    const shippingCharge = cartItems.length > 0 ? 50 : 0;
    total = Math.max(0, total); // Final safeguard for rendering

    // Create a display version for frontend
    const cartDisplay = cart ? {
      ...cart._doc,
      displayDiscount: cart.discount ? -cart.discount : 0 // Negative for frontend
    } : null;

    res.render('checkout', {
      cartItems,
      cart,
      addresses,
      subtotal: subtotal || 0,
      offerDiscount: offerDiscount || 0,
      couponDiscount: couponDiscount || 0,
      shippingCharge,
      total: total || 0,
      profilePicture: userData.profilePicture || null,
      cart: !req.query.orderId ? cartDisplay : null,
      userId,
      orderId: req.query.orderId || null,
    });
  } catch (error) {
    console.error('Error in getCheckoutPage:', error);
    res.redirect('/pageNotFound');
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const {
      addressId,
      couponCode,
      paymentMethod,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    if (!["COD", "Razorpay", "Wallet"].includes(paymentMethod)) {
      console.warn("Invalid payment method:", { paymentMethod });
      return res.redirect("/pageNotFound");
    }

    let order;

    if (orderId) {
      // Retry payment case
      order = await Order.findOne({ orderId });
      if (!order || order.user.toString() !== userId.toString()) {
        console.warn(`Order not found or unauthorized: orderId=${orderId}, userId=${userId}`);
        return res.redirect('/pageNotFound');
      }
      if (!['Pending', 'Failed'].includes(order.paymentStatus)) {
        return res.redirect(`/payment-failure?error=Payment%20retry%20not%20allowed%20for%20this%20order%20status&orderId=${orderId}`);
      }
    } else {
      // New order case
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      const addressDoc = await Address.findOne({ userId });
      const deliveryAddress = addressDoc?.address.find(
        (address) => address._id.toString() === addressId.toString()
      );

      if (!cart || !cart.items.length || !deliveryAddress) {
        console.warn("Invalid order data:", {
          hasCart: !!cart,
          hasItems: cart?.items.length,
          hasAddress: !!deliveryAddress,
        });
        return res.redirect("/pageNotFound");
      }

      const validItems = cart.items.filter(item =>
        item.productId && typeof item.productId.quantity === "number" &&
        item.productId.quantity >= item.quantity && typeof item.price === "number" && !isNaN(item.price)
      );

      if (!validItems.length) {
        console.error("No valid items to process order:", { cartItems: cart.items });
        return res.redirect("/pageNotFound");
      }

      // Calculate offer discounts for each item
      const orderedItems = [];
      let totalPrice = 0;
      let offerDiscount = 0;
      for (const item of validItems) {
        const { offer, originalPrice, discountedPrice, discount } = await findBestOffer(item.productId._id);
        orderedItems.push({
          product: item.productId._id,
          quantity: item.quantity,
          price: originalPrice,
          discount: discount,
          totalPrice: Math.max(0, discountedPrice * item.quantity),
          offerId: offer ? offer._id : null,
          offerCode: offer ? offer.code : '',
        });
        totalPrice += originalPrice * item.quantity;
        offerDiscount += discount * item.quantity;
      }

      const shippingFee = 50;
      const couponDiscount = cart.coupon?.discount || 0;
      let finalAmount = totalPrice - offerDiscount - couponDiscount + shippingFee;

      // Ensure finalAmount is non-negative
      if (finalAmount < 0) {
        console.warn(`Negative finalAmount detected: totalPrice=${totalPrice}, offerDiscount=${offerDiscount}, couponDiscount=${couponDiscount}, shipping=${shippingFee}`);
        finalAmount = Math.max(0, finalAmount);
        offerDiscount = Math.min(offerDiscount, totalPrice);
        couponDiscount = Math.min(couponDiscount, totalPrice - offerDiscount);
      }

      order = new Order({
        userId,
        orderId: uuidv4(),
        orderedItems,
        totalPrice,
        discount: couponDiscount,
        offerDiscount,
        finalAmount,
        address: addressId,
        invoiceDate: new Date(),
        status: "pending",
        createdOn: new Date(),
        couponApplied: couponDiscount > 0,
        user: userId,
        paymentMethod,
      });
    }

    if (paymentMethod === "COD") {
      order.paymentStatus = "Pending";
      order.status = "pending";
    } else if (paymentMethod === "Wallet") {
      const user = await User.findById(userId);
      if (user.wallet >= order.finalAmount) {
        user.wallet -= order.finalAmount;
        await user.save();
        await Wallet.create({
          userId,
          type: "DEBIT",
          amount: order.finalAmount,
          reason: `Payment for Order ${order.orderId}`,
          balanceAfter: user.wallet,
        });
        order.paymentStatus = "Paid";
        order.status = "processing";
      } else {
        order.paymentStatus = "Failed";
      }
    } else if (paymentMethod === "Razorpay") {
      order.razorpayOrderId = razorpay_order_id;
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;

      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

      if (expectedSignature === razorpay_signature) {
        order.paymentStatus = "Paid";
        order.status = "processing";
      } else {
        order.paymentStatus = "Failed";
      }
    }

    await order.save();

    if (!orderId) {
      for (const item of order.orderedItems) {
        const product = await Product.findById(item.product);
        product.quantity -= item.quantity;
        await product.save();
      }
      await Cart.deleteOne({ userId });
    }

    req.session.orderId = order.orderId;
    if (order.paymentStatus === "Paid" || order.paymentStatus === "Pending") {
      res.redirect("/order-success");
    } else {
      res.redirect(`/payment-failure?error=Payment%20failed%20or%20pending&orderId=${order.orderId}`);
    }
  } catch (error) {
    console.error("Error in placeOrder:", error);
    res.redirect(`/payment-failure?error=Failed%20to%20process%20order&orderId=${req.body.orderId || ''}`);
  }
};

// Rest of the controller functions remain unchanged
const retryPayment = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    const userId = req.session.user._id;
    const order = await Order.findOne({ orderId }).populate('orderedItems.product');
    if (!order || order.user.toString() !== userId.toString() || !['Pending', 'Failed'].includes(order.paymentStatus)) {
      return res.redirect('/pageNotFound');
    }

    const options = {
      amount: order.finalAmount * 100,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);
    console.log('Razorpay order created for retry:', razorpayOrder);

    res.render('order-details', {
      order,
      selectedAddress: order.address,
      user: req.session.user,
      razorpayOrder: razorpayOrder,
      razorpayKey: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error in retryPayment:', error);
    res.redirect('/pageNotFound');
  }
};

const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, addressId, couponCode, orderId } = req.body;
    const userId = req.session.user?._id;
    console.log('Creating Razorpay order:', { amount, addressId, couponCode, orderId, userId });

    let finalAmount;
    let newOrder;

    if (orderId) {
      const order = await Order.findOne({ orderId });
      if (!order || order.user.toString() !== userId) {
        console.error('Order not found or unauthorized:', { orderId, userId });
        return res.status(400).json({ success: false, message: 'Order not found or unauthorized' });
      }
      if (!['Pending', 'Failed'].includes(order.paymentStatus) || ['Cancelled', 'Delivered', 'Returned'].includes(order.status)) {
        console.error('Payment retry not allowed:', { orderId, paymentStatus: order.paymentStatus, status: order.status });
        return res.status(400).json({ success: false, message: 'Payment retry not allowed for this order status' });
      }
      finalAmount = order.finalAmount * 100;
      newOrder = order;
    } else {
      if (!amount || !addressId) {
        console.error('Missing required fields:', { amount, addressId });
        return res.status(400).json({ success: false, message: 'Amount and address ID are required' });
      }
      const cart = await Cart.findOne({ userId }).populate('items.productId');
      if (!cart || !cart.items.length) {
        console.error('Cart is empty or not found:', { userId });
        return res.status(400).json({ success: false, message: 'Cart is empty' });
      }

      const subtotal = cart.subtotal;
      const shipping = cart.shipping;
      const discount = cart.discount || 0;
      finalAmount = cart.total * 100;

      const orderedItems = cart.items.map(item => ({
        product: item.productId._id,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount || 0,
        totalPrice: (item.price - (item.discount || 0)) * item.quantity,
        offerId: item.offerId || null,
        offerCode: item.offerCode || '',
        status: 'pending',
      }));

      newOrder = new Order({
        orderId: uuidv4(),
        user: userId,
        orderedItems,
        totalPrice: subtotal,
        discount,
        finalAmount: cart.total,
        address: addressId,
        paymentMethod: 'Razorpay',
        paymentStatus: 'Pending',
        status: 'pending',
        couponApplied: couponCode ? true : false,
        invoiceDate: new Date(),
      });

      await newOrder.save();
      console.log('New order created:', newOrder.orderId);

      await Cart.findOneAndUpdate(
        { userId },
        { $set: { items: [], subtotal: 0, discount: 0, total: 0, coupon: {} } }
      );
      console.log('Cart cleared for user:', userId);
    }

    const options = {
      amount: finalAmount,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        orderId: newOrder.orderId,
      },
    };

    const razorpayOrder = await razorpay.orders.create(options);
    console.log('Razorpay order created:', razorpayOrder);

    newOrder.razorpayOrderId = razorpayOrder.id;
    await newOrder.save();

    res.status(200).json({ success: true, order: razorpayOrder, orderId: newOrder.orderId });
  } catch (error) {
    console.error('Error creating Razorpay order:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Failed to create Razorpay order' });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    console.log('Verifying Razorpay payment:', { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      console.error('Missing Razorpay payment details');
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      let order = await Order.findOne({ orderId });
      if (!order) {
        console.error('Order not found for orderId:', orderId);
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      order.paymentStatus = 'Paid';
      order.status = 'processing';
      order.razorpayOrderId = razorpay_order_id;
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      await order.save();

      req.session.orderId = orderId;
      console.log('Session updated with orderId:', req.session.orderId);

      console.log('Payment verification successful for order:', orderId);
      res.status(200).json({ success: true, message: 'Payment verified successfully', orderId });
    } else {
      console.error('Invalid payment signature');
      const order = await Order.findOne({ orderId });
      if (order) {
        order.paymentStatus = 'Failed';
        await order.save();
      }
      res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
};

const loadOrders = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const userData = await User.findById(userId);

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments({ user: userId });
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find({ user: userId })
      .populate("orderedItems.product")
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    res.render("order", {
      orders,
      user: userData,
      userData,
      profilePicture: userData.profilePicture || null,
      totalPages,
      currentPage: page,
    });
  } catch (error) {
    console.error(error);
    res.render("order", {
      orders: [],
      user: req.user,
      error: "Failed to load orders",
      totalPages: 0,
      currentPage: 1,
    });
  }
};

const loadOrderSuccessPage = async (req, res) => {
  try {
    const orderId = req.session.orderId;
    const userId = req.session.user?._id;
    console.log(orderId, userId, "====================================");

    if (!userId || !orderId) {
      console.error('Session data missing:', { orderId, userId });
      return res.redirect('/pageNotFound');
    }

    const userData = await User.findById(userId);
    if (!userData) {
      console.error('User not found:', { userId });
      return res.redirect('/pageNotFound');
    }

    const order = await Order.findOne({ orderId, user: userId })
      .populate('orderedItems.product')
      .populate('user')
      .populate('address');

    if (!order) {
      console.error('Order not found:', { orderId, userId });
      return res.redirect('/pageNotFound');
    }

    const deliveryAddress = order.address || null;

    res.render('order-success', {
      order,
      userName: order.user?.name || userData.name || 'Customer Name',
      deliveryAddress,
      profilePicture: userData.profilePicture || null,
      title: 'Order Successful - ZAPZONE'
    });

    delete req.session.orderId;
  } catch (error) {
    console.error('Error in loadOrderSuccessPage:', error.message, error.stack);
    res.redirect('/pageNotFound');
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const userData = await User.findById(userId);
    const orderId = req.query.id;
    if (!orderId) {
      return res.status(400).send("Order ID required");
    }

    const order = await Order.findOne({ orderId })
      .populate("orderedItems.product")
      .populate("user")
      .lean();

    if (!order) {
      return res.status(404).send("Order not found");
    }

    const addressDoc = await Address.findOne({ userId });
    let selectedAddress = null;
    if (addressDoc && addressDoc.address && order.address) {
      selectedAddress = addressDoc.address.find(
        (addr) =>
          addr._id.toString() === order.address.toString() && !addr.isDeleted
      );
    }

    res.render("order-detail", {
      order,
      selectedAddress: selectedAddress || null,
      profilePicture: userData.profilePicture || null,
    });
  } catch (error) {
    console.error("Error while fetching order details:", error);
    res.status(500).send("Server error");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    if (!orderId || !reason) {
      return res.status(404).json({
        success: false,
        message: "Order ID and reason are required",
      });
    }
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order Not found",
      });
    }
    if (["Delivered", "Cancelled", "Returned"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled. Current Status: ${order.status}`,
      });
    }
    order.status = "Cancelled";
    order.cancellationReason = reason;
    order.createdOn = new Date();

    await order.save();

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling Order", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while cancelling the order",
    });
  }
};

const cancelProduct = async (req, res) => {
  try {
    const { orderId, productId } = req.body;

    if (!orderId || !productId) {
      return res.json({
        success: false,
        message: "Required fields are missing",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    if (!["pending", "processing"].includes(order.status.toLowerCase())) {
      return res.json({
        success: false,
        message: "Cannot cancel product at this stage",
      });
    }

    const productItem = order.orderedItems.find(
      (item) => item.product.toString() === productId.toString()
    );
    if (!productItem) {
      return res.json({
        success: false,
        message: "Product not found in order",
      });
    }

    if (["Cancelled", "Returned"].includes(productItem.status)) {
      return res.json({
        success: false,
        message: "Item cannot be cancelled at this stage!",
      });
    }

    productItem.status = "Cancelled";
    const refundAmount = productItem.price * productItem.quantity;

    const newFinalAmount = order.orderedItems.reduce((sum, item) => {
      if (!["Cancelled", "Returned"].includes(item.status)) {
        return sum + item.price * item.quantity;
      }
      return sum;
    }, 0);

    order.finalAmount = newFinalAmount;

    const allItemsInactive = order.orderedItems.every((item) =>
      ["Cancelled", "Returned"].includes(item.status)
    );
    if (allItemsInactive) {
      order.status = "Cancelled";
    }

    const user = await User.findById(order.user);
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    user.wallet += refundAmount;

    await Wallet.create({
      userId: user._id,
      type: "CREDIT",
      amount: refundAmount,
      reason: `Refund for cancelled item in Order ${order.orderId}`,
      balanceAfter: user.wallet,
    });
    await Product.findByIdAndUpdate(
      productId,
      { $inc: { quantity: productItem.quantity } },
      { new: true }
    );

    await user.save();
    await order.save();

    return res.json({
      success: true,
      message: "Product cancelled and amount refunded to wallet",
      walletBalance: user.wallet,
    });
  } catch (error) {
    console.error("Error while cancelling the product:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const requestReturn = async (req, res) => {
  try {
    const { orderId, itemId, reason } = req.body;
    const userId = req.session.user._id;

    if (!orderId || !itemId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Order ID, Item ID, and reason are required.",
      });
    }

    const order = await Order.findOne({ orderId }).populate(
      "orderedItems.product"
    );
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }
    if (order.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You do not own this order.",
      });
    }

    if (order.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Returns can only be requested for delivered orders.",
      });
    }

    const item = order.orderedItems.find(
      (i) => i.product._id.toString() === itemId
    );
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order.",
      });
    }

    if (["Return Requested", "Returned"].includes(item.status)) {
      return res.status(400).json({
        success: false,
        message: "Return request already submitted or item already returned.",
      });
    }

    item.status = "Return Requested";
    item.returnReason = reason;

    const allItemsProcessed = order.orderedItems.every((i) =>
      ["Return Requested", "Returned", "Cancelled"].includes(i.status)
    );
    if (allItemsProcessed) {
      order.status = "Return Requested";
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: "Return request submitted successfully.",
    });
  } catch (error) {
    console.error("Error processing return request:", error);
    res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

const loadWallet = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const userData = await User.findById(userId);

    const user = await User.findById(userId).select("wallet");
    if (!user) {
      return res.status(404).render("error", { message: "User not found" });
    }

    const transactions = await Wallet.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);

    res.render("wallet", {
      balance: Number(user.wallet || 0),
      transactions,
      profilePicture: userData.profilePicture || null,
    });
  } catch (error) {
    console.error("Error loading wallet:", error);
    res.status(500).render("error", { message: "Failed to load wallet" });
  }
};

const getAvailableCoupons = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });

    res.status(200).json({ success: true, coupons });
  } catch (error) {
    console.error("Error fetching available coupons:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode, subtotal } = req.body;
    const userId = req.session.user._id;

    if (!couponCode || isNaN(subtotal)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Valid coupon code and subtotal are required",
        });
    }

    const coupon = await Coupon.findOne({
      code: couponCode.trim().toUpperCase(),
      isActive: true,
      isDeleted: false,
    });

    if (!coupon) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid coupon code" });
    }

    const currentDate = new Date();
    if (currentDate < coupon.validFrom || currentDate >= new Date(coupon.expiryDate.getTime() + 24 * 60 * 60 * 1000)) {
      return res.status(400).json({ success: false, message: "Coupon is expired" });
    }

    if (subtotal < coupon.minOrderAmount) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Minimum cart value of ₹${coupon.minOrderAmount} is required`,
        });
    }

    let discount = 0;
    if (coupon.discountType === "fixed") {
      discount = coupon.discountAmount;
    } else if (coupon.discountType === "percentage") {
      discount = (coupon.discountAmount / 100) * subtotal;
    }

    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }

    discount = Math.floor(discount);

    const cart = await Cart.findOne({ userId });
    if (cart) {
      cart.discount = discount;
      cart.coupon = {
        code: coupon.code,
        discount,
        couponId: coupon._id,
      };

      let cartSubtotal = 0;
      let cartOfferDiscount = 0;
      cart.items.forEach((item) => {
        cartSubtotal += item.price * item.quantity;
        cartOfferDiscount +=
          typeof item.discount === "number" ? item.discount : 0;
      });

      const shippingCost =
        typeof cart.shipping === "number" ? cart.shipping : 50;
      cart.total = Math.max(0, cartSubtotal - cartOfferDiscount - discount + shippingCost);
      await cart.save();
    }

    if (!coupon.usedBy.includes(userId)) {
      coupon.usedBy.push(userId);
      await coupon.save();
    }

    return res.status(200).json({ success: true, discount });
  } catch (error) {
    console.error("Error applying coupon:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const { userId } = req.body;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    cart.discount = 0;
    cart.coupon = { code: "", discount: 0 };
    cart.total = Math.max(0, cart.subtotal + cart.shipping);
    await cart.save();

    res
      .status(200)
      .json({ success: true, message: "Coupon removed successfully" });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const loadPaymentFailurePage = async (req, res) => {
  try {
    if (!req.session.user || !req.session.user._id) {
      return res.redirect("/login?returnUrl=/payment-failure");
    }
    const userId = req.session.user._id;
    const userData = await User.findById(userId);
    if (!userData) {
      return res.redirect("/login?returnUrl=/payment-failure");
    }
    const error = req.query.error || "Payment failed. Please try again.";
    const orderId = req.query.orderId || req.session.orderId;
    console.log("Rendering order-failure with error:", error, "orderId:", orderId);
    res.render("order-failure", {
      error,
      profilePicture: userData.profilePicture || null,
      orderId: orderId || null,
    });
  } catch (error) {
    console.error("Error in loadPaymentFailurePage:", error);
    res.redirect("/pageNotFound");
  }
};

module.exports = {
  getCheckoutPage,
  placeOrder,
  loadOrderSuccessPage,
  loadOrders,
  loadOrderDetails,
  cancelOrder,
  cancelProduct,
  requestReturn,
  loadWallet,
  getAvailableCoupons,
  applyCoupon,
  removeCoupon,
  retryPayment,
  createRazorpayOrder,
  verifyRazorpayPayment,
  loadPaymentFailurePage,
};