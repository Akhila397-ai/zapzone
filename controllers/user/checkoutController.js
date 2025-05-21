const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");
const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const { login } = require("./userController");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    let subtotal = 0;
    let offerDiscount = 0;
    let couponDiscount = 0;
    const validItems = [];

    if (cart && Array.isArray(cart.items)) {
      cart.items.forEach((item) => {
        const product = item.productId;
        const price = item.price;
        const qty = Number(item.quantity);
        const itemDiscount = item.discount || 0;

        if (
          product &&
          typeof price === "number" &&
          !isNaN(qty) &&
          !isNaN(price)
        ) {
          subtotal += price * qty;
          offerDiscount += itemDiscount;
          validItems.push(item);
        } else {
          console.warn("Skipping invalid cart item in checkout:", {
            productId: product?._id,
            price,
            qty,
            item,
          });
        }
      });

      couponDiscount = cart.discount || 0;
    }

    const shippingCharge = 50;
    const total = subtotal - offerDiscount - couponDiscount + shippingCharge;

    res.render("checkout", {
      cartItems: validItems,
      addresses,
      subtotal: subtotal || 0,
      offerDiscount: offerDiscount || 0,
      couponDiscount: couponDiscount || 0,
      shippingCharge,
      total: total || 0,
      profilePicture: userData.profilePicture || null,
      cart,
      userId,
    });
  } catch (error) {
    console.error("Error in getCheckoutPage:", error);
    res.redirect("/pageNotFound");
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
    } = req.body;

    // Validate payment method
    if (!["COD", "Razorpay", "Wallet"].includes(paymentMethod)) {
      console.warn("Invalid payment method:", { paymentMethod });
      return res.redirect("/pageNotFound");
    }

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

    const cartItems = cart.items;
    const validItems = [];

    for (const item of cartItems) {
      if (
        !item.productId ||
        typeof item.productId.quantity !== "number" ||
        item.productId.quantity < item.quantity ||
        typeof item.price !== "number" ||
        isNaN(item.price)
      ) {
        console.warn("Skipping invalid item in placeOrder:", {
          productId: item.productId?._id,
          productQuantity: item.productId?.quantity,
          itemPrice: item.price,
          itemQuantity: item.quantity,
        });
        continue;
      }
      validItems.push(item);
    }

    if (!validItems.length) {
      console.error("No valid items to process order:", { cartItems });
      return res.redirect("/pageNotFound");
    }

    let totalPrice = 0;
    const orderedItems = validItems.map((item) => {
      const itemTotal = item.price * item.quantity;
      totalPrice += itemTotal;
      return {
        product: item.productId._id,
        quantity: item.quantity,
        price: item.price,
      };
    });

    if (isNaN(totalPrice) || totalPrice <= 0) {
      console.error("Invalid total price:", { totalPrice, orderedItems });
      return res.redirect("/pageNotFound");
    }

    const shippingFee = 50;
    const couponDiscount = cart.discount || 0;
    const finalAmount = totalPrice + shippingFee - couponDiscount;

    const newOrder = new Order({
      userId,
      orderedItems,
      totalPrice,
      discount: couponDiscount,
      finalAmount,
      address: addressId,
      invoiceDate: new Date(),
      status: "pending",
      createdOn: new Date(),
      couponApplied: couponDiscount > 0,
      user: req.session.user._id,
      paymentMethod, // Add payment method
      ...(paymentMethod === "Razorpay" && {
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      }), // Include Razorpay details if applicable
    });

    await newOrder.save();
    console.log("orderId:", newOrder.orderId);

    for (const item of validItems) {
      item.productId.quantity -= item.quantity;
      await item.productId.save();
    }

    await Cart.deleteOne({ userId });

    req.session.orderId = newOrder.orderId;
    res.redirect("/order-success");
  } catch (error) {
    console.error("Error in placeOrder:", error);
    res.redirect("/pageNotFound");
  }
};
const loadOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    let query = { user: userId };
    if (search) {
      query = {
        ...query,
        $or: [
          { orderId: { $regex: search, $options: "i" } },
          { "user.name": { $regex: search, $options: "i" } },
        ],
      };
    }

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
    const userId = req.session.user._id;
    const userData = await User.findById(userId);

    const order = await Order.findOne({ orderId, user: userId })
      .populate("orderedItems.product")
      .populate("user");

    if (!order) {
      console.error("Order not found:", { orderId, userId });
      return res.redirect("/pageNotFound");
    }

    const addressDoc = await Address.findOne({ userId });

    let deliveryAddress = null;
    if (addressDoc && addressDoc.address && order.address) {
      deliveryAddress = addressDoc.address.find(
        (addr) => addr._id.toString() === order.address.toString()
      );
    }

    res.render("order-success", {
      order,
      userName: order.user ? order.user.name : "Customer Name",
      deliveryAddress: deliveryAddress || null,
      profilePicture: userData.profilePicture || null,
    });
  } catch (error) {
    console.error("Error in loadOrderSuccessPage:", error.message);
    res.redirect("/pageNotFound");
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
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
    console.log(selectedAddress, "tfsd");

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
        message: `Order cannot be cancelled.Current Status: ${order.status}`,
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
      message: "an error occured while cancelling the order",
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

    // Mark item as cancelled
    productItem.status = "Cancelled";

    // Calculate the refund for this item
    const refundAmount = productItem.price * productItem.quantity;

    // Recalculate final order amount (excluding cancelled/returned items)
    const newFinalAmount = order.orderedItems.reduce((sum, item) => {
      if (!["Cancelled", "Returned"].includes(item.status)) {
        return sum + item.price * item.quantity;
      }
      return sum;
    }, 0);

    order.finalAmount = newFinalAmount;

    // If all items are cancelled or returned, cancel the order
    const allItemsInactive = order.orderedItems.every((item) =>
      ["Cancelled", "Returned"].includes(item.status)
    );
    if (allItemsInactive) {
      order.status = "Cancelled";
    }

    // Refund to wallet
    const user = await User.findById(order.user);
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    user.wallet += refundAmount;

    // Save wallet transaction
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
    console.log(reason);

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
    console.log(userId);
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
  } catch (err) {
    console.error("Error loading wallet:", err);
    res.status(500).render("error", { message: "Failed to load wallet" }); // Catch block
  }
};

const getAvailableCoupons = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log("Today (ISO):", today.toISOString());
    console.log("Today (Timestamp):", today.getTime());
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });
    console.log(
      coupons.map((c) => ({
        code: c.code,
        validFrom: c.validFrom,
        expiryDate: c.expiryDate,
        isActive: c.isActive,
        isDeleted: c.isDeleted,
      }))
    );

    console.log("Fetched coupons:", coupons);
    console.log("Coupon count:", coupons.length);

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

    if ( currentDate < coupon.validFrom || currentDate >= new Date(coupon.expiryDate.getTime() + 24 * 60 * 60 * 1000)) {
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
      cart.total = cartSubtotal - cartOfferDiscount - discount + shippingCost;
      await cart.save();
    }

    // Add user to usedBy only if not already used
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
    cart.total = cart.subtotal + cart.shipping;
    await cart.save();

    res
      .status(200)
      .json({ success: true, message: "Coupon removed successfully" });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, addressId, couponCode } = req.body;
    const userId = req.session.user._id;
    console.log("Creating Razorpay order:", {
      amount,
      addressId,
      couponCode,
      userId,
    });

    if (!amount || !addressId) {
      console.error("Missing required fields:", { amount, addressId });
      return res
        .status(400)
        .json({
          success: false,
          message: "Amount and address ID are required",
        });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.items.length) {
      console.error("Cart is empty or not found:", { userId });
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const options = {
      amount: amount,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    console.log("Razorpay order created:", order);
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create Razorpay order" });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    console.log("Verifying Razorpay payment:", {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.error("Missing Razorpay payment details");
      return res
        .status(400)
        .json({ success: false, message: "Missing payment details" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      console.log("Payment verification successful");
      res
        .status(200)
        .json({ success: true, message: "Payment verified successfully" });
    } else {
      console.error("Invalid payment signature");
      res
        .status(400)
        .json({ success: false, message: "Invalid payment signature" });
    }
  } catch (error) {
    console.error("Error verifying Razorpay payment:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to verify payment" });
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
    console.log("Rendering order-failure with error:", error);
    res.render("order-failure", {
      error,
      profilePicture: userData.profilePicture || null,
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
  createRazorpayOrder,
  verifyRazorpayPayment,
  loadPaymentFailurePage,
};
