const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const { login } = require("./userController");

const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    let subtotal = 0;
    const validItems = [];
    if (cart && Array.isArray(cart.items)) {
      cart.items.forEach((item) => {
        const product = item.productId;
        const price = item.price;
        const qty = Number(item.quantity);

        if (
          product &&
          typeof price === "number" &&
          !isNaN(qty) &&
          !isNaN(price)
        ) {
          subtotal += price * qty;
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
    }

    res.render("checkout", {
      cartItems: validItems,
      addresses,
      subtotal: subtotal || 0,
      shippingCharge: 50,
      total: (subtotal || 0) + 50,
      profilePicture: userData.profilePicture || null,
    });
  } catch (error) {
    console.error("Error in getCheckoutPage:", error);
    res.redirect("/pageNotFound");
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId } = req.body;

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
    const finalAmount = totalPrice + shippingFee;

    const newOrder = new Order({
      userId,
      orderedItems,
      totalPrice,
      discount: 0,
      finalAmount,
      address: addressId,
      invoiceDate: new Date(),
      status: "pending",
      createdOn: new Date(),
      couponApplied: false,
      user: req.session.user._id,
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
      currentPage: page
    });
  } catch (error) {
    console.error(error);
    res.render("order", {
      orders: [],
      user: req.user,
      error: "Failed to load orders",
      totalPages: 0,
      currentPage: 1
    });
  }
};


const loadOrderSuccessPage = async (req, res) => {
  try {
    const orderId = req.session.orderId;
    const userId = req.session.user._id;

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
      return res.json({ success: false, message: "Required fields are missing" });
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

    const productItem = order.orderedItems.find(item => item.product.toString() === productId.toString());
    if (!productItem) {
      return res.json({ success: false, message: "Product not found in order" });
    }

    if (productItem.status && (productItem.status === "Cancelled" || productItem.status === "Returned")) {
      return res.json({
        success: false,
        message: "Item cannot be cancelled at this stage!",
      });
    }

    productItem.status = "Cancelled";

    const newFinalAmount = order.orderedItems.reduce((sum, item) => {
      if (!item.status || (item.status !== "Cancelled" && item.status !== "Returned")) {
        return sum + item.price * item.quantity;
      }
      return sum;
    }, 0);

    order.finalAmount = newFinalAmount > 0 ? newFinalAmount : 0;

    const allItemsInactive = order.orderedItems.every(item =>
      item.status === "Cancelled" || item.status === "Returned"
    );

    if (allItemsInactive) {
      order.status = "Cancelled";
    }

    await order.save();

    return res.json({ success: true, message: "Product cancelled successfully" });
  } catch (error) {
    console.error("Error while cancelling the product:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

  const requestReturn = async (req, res) => {
    try {
      const { orderId, itemId, reason } = req.body;
      const userId = req.session.user._id;
  
      if (!orderId || !itemId || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Order ID, Item ID, and reason are required.',
        });
      }
  
      const order = await Order.findOne({ orderId }).populate('orderedItems.product');
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.',
        });
      }
      if (order.user.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You do not own this order.',
        });
      }
  
      if (order.status !== 'Delivered') {
        return res.status(400).json({
          success: false,
          message: 'Returns can only be requested for delivered orders.',
        });
      }
  
      const item = order.orderedItems.find(
        (i) => i.product._id.toString() === itemId
      );
      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Item not found in order.',
        });
      }
  
      if (['Return Requested', 'Returned'].includes(item.status)) {
        return res.status(400).json({
          success: false,
          message: 'Return request already submitted or item already returned.',
        });
      }
  
      item.status = 'Return Requested';
      item.returnReason = reason;
      console.log(reason);
      
      
  
      const allItemsProcessed = order.orderedItems.every(
        (i) => ['Return Requested', 'Returned', 'Cancelled'].includes(i.status)
      );
      if (allItemsProcessed) {
        order.status = 'Return Requested';
      }
  
      await order.save();
  
      res.status(200).json({
        success: true,
        message: 'Return request submitted successfully.',
      });
    } catch (error) {
      console.error('Error processing return request:', error);
      res.status(500).json({
        success: false,
        message: 'Server error.',
      });
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
};
