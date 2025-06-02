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
const { log } = require("util");
const PDFDocument = require('pdfkit');
const fs = require('fs');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

      if (discount > maxDiscount) {
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
      discountedPrice: Math.max(0, discountedPrice),
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
          productId: item.quantity,
          quantity: item.price,
          price: item.discount,
          discount: item.totalPrice || item.price * item.quantity,
          totalPrice: item.offerId || null,
          offerId: item.offerCode || '',
          offerCode: item.offerName,
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
        cart.items = cart.items.filter(
          (item) =>
            item.productId &&
            !item.productId.isDeleted &&
            !item.productId.isBlocked &&
            item.productId.quantity >= item.quantity
        );

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

        if (total < 0) {
          console.warn(`Negative total detected: subtotal=${subtotal}, offerDiscount=${offerDiscount}, couponDiscount=${couponDiscount}, shipping=${shippingCharge}`);
          total = Math.max(0, total);
          offerDiscount = Math.min(offerDiscount, subtotal);
          couponDiscount = Math.min(couponDiscount, subtotal - offerDiscount);
        }

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
    total = Math.max(0, total);

    const cartDisplay = cart ? {
      ...cart._doc,
      displayDiscount: cart.discount ? -cart.discount : 0
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
    const userId = req.session.user?._id;
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
      order = await Order.findOne({ orderId });
      if (!order || order.user.toString() !== userId.toString()) {
        console.warn(`Order not found or unauthorized: orderId=${orderId}, userId=${userId}`);
        return res.redirect('/pageNotFound');
      }
      if (!['Pending', 'Failed'].includes(order.paymentStatus)) {
        return res.redirect(`/payment-failure?error=Payment%20retry%20not%20allowed%20for%20this%20order%20status&orderId=${orderId}`);
      }
    } else {
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
          status: 'pending',
        });
        totalPrice += originalPrice * item.quantity;
        offerDiscount += discount * item.quantity;
      }

      const shippingFee = 50;
      const couponDiscount = cart.coupon?.discount || 0;
      let finalAmount = totalPrice - offerDiscount - couponDiscount + shippingFee;

      if (finalAmount < 0) {
        console.warn(`Negative finalAmount detected: totalPrice=${totalPrice}, offerDiscount=${offerDiscount}, couponDiscount=${couponDiscount}, shipping=${shippingFee}`);
        finalAmount = Math.max(0, finalAmount);
        offerDiscount = Math.min(offerDiscount, totalPrice);
        couponDiscount = Math.min(couponDiscount, totalPrice - offerDiscount);
      }
      

      if (paymentMethod === "COD" && finalAmount > 1000) {
        console.warn(`COD not allowed for orders above ₹1000: finalAmount=${finalAmount}`);
        return res.redirect(`/payment-failure?error=COD%20not%20allowed%20for%20orders%20above%20₹1000`);
      }


      order = new Order({
        user: userId, 
        orderedItems,
        totalPrice,
        discount: couponDiscount,
        offerDiscount,
        finalAmount,
        address: addressId,
        invoiceDate: new Date(),
        status: 'pending',
        createdOn: new Date(),
        couponApplied: couponDiscount > 0,
        paymentMethod,
      });
    }

    if (paymentMethod === "COD") {
      order.paymentStatus = 'Pending';
      order.status = 'pending';
      order.orderedItems.forEach(item => {
        item.status = 'pending';
      });
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
        order.paymentStatus = 'Paid';
        order.status = 'processing';
        order.orderedItems.forEach(item => {
          item.status = 'processing';
        });
      } else {
        order.paymentStatus = 'Failed';
        order.status = 'Failed';
        order.orderedItems.forEach(item => {
          item.status = 'Failed';
        });
      }
    } else if (paymentMethod === "Razorpay") {
      order.razorpayOrderId = razorpay_order_id;
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;

      if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
          .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
          .update(body.toString())
          .digest('hex');

        if (expectedSignature === razorpay_signature) {
          order.paymentStatus = 'Paid';
          order.status = 'processing';
          order.orderedItems.forEach(item => {
            item.status = 'processing';
          });
        } else {
          console.error('Invalid Razorpay signature for order:', order.orderId);
          order.paymentStatus = 'Failed';
          order.status = 'Failed';
          order.orderedItems.forEach(item => {
            item.status = 'Failed';
          });
        }
      } else {
        console.error('Razorpay payment failed for order:', order.orderId, 'Missing or invalid payment details');
        order.paymentStatus = 'Failed';
        order.status = 'Failed';
        order.orderedItems.forEach(item => {
          item.status = 'Failed';
        });
      }
    }

    await order.save();

    if (!orderId) {
      for (const item of order.orderedItems) {
        const product = await Product.findById(item.product);
        if (product) {
          product.quantity -= item.quantity;
          await product.save();
        }
      }
      await Cart.deleteOne({ userId });
    }

    req.session.orderId = order.orderId;
    console.log('Stored orderId in session:', req.session.orderId);

if (order.paymentStatus === 'Paid' || (paymentMethod === 'COD' && order.paymentStatus === 'Pending')) {
  req.session.orderId = order.orderId; 
  res.redirect(`/order-success?orderId=${order.orderId}`);
} else {
  res.redirect(`/payment-failure?error=Payment%20failed&orderId=${order.orderId}`);
}
  } catch (error) {
    console.error('Error in placeOrder:', error.message, error.stack);
    if (req.body.orderId) {
      const order = await Order.findOne({ orderId: req.body.orderId });
      if (order) {
        order.paymentStatus = 'Failed';
        order.status = 'Failed';
        order.orderedItems.forEach(item => {
          item.status = 'Failed';
        });
        await order.save();
        console.log('Order updated to Failed due to placeOrder error:', req.body.orderId);
      }
    }
    res.redirect(`/payment-failure?error=Failed%20to%20process%20order&orderId=${req.body.orderId || ''}`);
  }
};
const retryPayment = async (req, res) => {
  try {
     const orderId = req.query.id;
     console.log(orderId,'2222222222222222222');
     
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

    if (orderId && !orderId.startsWith('ZZ-ORD-')) {
      console.error('Invalid orderId format:', orderId);
      return res.status(400).json({ success: false, message: 'Invalid order ID format' });
    }

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
      if (!addressId) {
        console.error('Missing required field: addressId');
        return res.status(400).json({ success: false, message: 'Address ID is required' });
      }

      const cart = await Cart.findOne({ userId }).populate('items.productId');
      const addressDoc = await Address.findOne({ userId });
      const deliveryAddress = addressDoc?.address.find(
        (address) => address._id.toString() === addressId.toString()
      );

      if (!cart || !cart.items.length || !deliveryAddress) {
        console.warn('Invalid order data:', {
          hasCart: !!cart,
          hasItems: cart?.items.length,
          hasAddress: !!deliveryAddress,
        });
        return res.status(400).json({ success: false, message: 'Cart is empty or address not found' });
      }

      const validItems = cart.items.filter(
        (item) =>
          item.productId &&
          typeof item.productId.quantity === 'number' &&
          item.productId.quantity >= item.quantity &&
          typeof item.price === 'number' &&
          !isNaN(item.price)
      );

      if (!validItems.length) {
        console.error('No valid items to process order:', { cartItems: cart.items });
        return res.status(400).json({ success: false, message: 'No valid items in cart' });
      }

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
          status: 'pending',
        });
        totalPrice += originalPrice * item.quantity;
        offerDiscount += discount * item.quantity;
      }

      const shippingFee = 50;
      const couponDiscount = cart.coupon?.discount || 0;
      let finalAmountCalc = totalPrice - offerDiscount - couponDiscount + shippingFee;

      if (finalAmountCalc < 0) {
        console.warn('Negative finalAmount detected:', {
          totalPrice,
          offerDiscount,
          couponDiscount,
          shippingFee,
        });
        finalAmountCalc = Math.max(0, finalAmountCalc);
        offerDiscount = Math.min(offerDiscount, totalPrice);
        couponDiscount = Math.min(couponDiscount, totalPrice - offerDiscount);
      }

      const generateOrderId = () => {
        const randomNum = Math.floor(10000000 + Math.random() * 90000000);
        return `ZZ-ORD-${randomNum}`;
      };

      newOrder = new Order({
        user: userId,
        orderedItems,
        totalPrice,
        discount: couponDiscount,
        offerDiscount,
        finalAmount: finalAmountCalc,
        address: addressId,
        paymentMethod: 'Razorpay',
        paymentStatus: 'Failed',
        status: 'Failed',
        couponApplied: couponDiscount > 0,
        invoiceDate: new Date(),
        orderId: generateOrderId(),
        createdOn: new Date(),
      });

      let retries = 3;
      while (retries > 0) {
        try {
          await newOrder.save();
          break;
        } catch (error) {
          if (error.code === 11000) {
            console.warn(`Duplicate orderId detected: ${newOrder.orderId}. Retrying...`);
            newOrder.orderId = generateOrderId();
            retries--;
            if (retries === 0) {
              console.error('Failed to generate unique orderId after retries');
              return res.status(500).json({ success: false, message: 'Failed to generate unique order ID' });
            }
          } else {
            throw error;
          }
        }
      }

      if (!newOrder.orderId) {
        console.error('Order ID is null after save');
        return res.status(500).json({ success: false, message: 'Failed to generate order ID' });
      }

      await Cart.findOneAndUpdate(
        { userId },
        { $set: { items: [], subtotal: 0, discount: 0, total: 0, coupon: {} } }
      );
      console.log('Cart cleared for user:', userId);

      finalAmount = finalAmountCalc * 100; 
    }

    const options = {
      amount: finalAmount,
      currency: 'INR',
      receipt: newOrder.orderId,
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
    if (req.body.orderId) {
      const order = await Order.findOne({ orderId: req.body.orderId });
      if (order) {
        order.paymentStatus = 'Failed';
        order.status = 'Failed';
        order.orderedItems.forEach((item) => {
          item.status = 'Failed';
        });
        await order.save();
        console.log('Order updated to Failed due to Razorpay order creation error:', req.body.orderId);
      }
    }
    res.status(500).json({ success: false, message: 'Failed to create Razorpay order' });
  }
};


const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    console.log('Verifying Razorpay payment:', { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      console.error('Missing Razorpay payment details:', req.body);
      return res.redirect(`/payment-failure?orderId=${orderId || ''}&error=Missing%20payment%20details`);
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('RAZORPAY_KEY_SECRET is not set');
      return res.redirect(`/payment-failure?orderId=${orderId}&error=Server%20configuration%20error`);
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    console.log('Signature comparison:', { expectedSignature, razorpay_signature });

    let order = await Order.findOne({ orderId: String(orderId) });
    if (!order) {
      console.error('Order not found for orderId:', orderId);
      return res.redirect(`/payment-failure?orderId=${orderId}&error=Order%20not%20found`);
    }

    if (expectedSignature === razorpay_signature) {
      for (const item of order.orderedItems) {
        const product = await Product.findById(item.product);
        if (!product) {
          console.error('Product not found:', item.product);
          order.paymentStatus = 'Failed';
          order.status = 'Failed';
          order.orderedItems.forEach(item => {
            item.status = 'Failed';
          });
          try {
            await order.save();
            console.log('Order updated to Failed due to product not found:', orderId);
          } catch (saveError) {
            console.error('Failed to save order:', saveError.message, saveError.stack);
          }
          return res.redirect(`/payment-failure?orderId=${orderId}&error=Product%20not%20found:%20${item.product}`);
        }
        if (product.quantity < item.quantity) {
          console.error('Insufficient stock for product:', {
            productId: item.product,
            available: product.quantity,
            requested: item.quantity,
          });
          order.paymentStatus = 'Failed';
          order.status = 'Failed';
          order.orderedItems.forEach(item => {
            item.status = 'Failed';
          });
          try {
            await order.save();
            console.log('Order updated to Failed due to insufficient stock:', orderId);
          } catch (saveError) {
            console.error('Failed to save order:', saveError.message, saveError.stack);
          }
          return res.redirect(`/payment-failure?orderId=${orderId}&error=Insufficient%20stock%20for%20product:%20${product.name}`);
        }
        product.quantity -= item.quantity;
        await product.save();
        console.log('Updated product quantity:', { productId: item.product, newQuantity: product.quantity });
      }

      order.paymentStatus = 'Paid';
      order.status = 'processing';
      order.razorpayOrderId = razorpay_order_id;
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      order.orderedItems.forEach(item => {
        item.status = 'processing';
      });
      try {
        await order.save();
        console.log('Payment verification successful for order:', orderId);
        req.session.orderId = orderId;
        console.log(req.session.orderId, '333333333333333333');
        
        return res.status(200).json({ success: true, message: 'Payment verified successfully', orderId });
      } catch (saveError) {
        console.error('Failed to save order:', saveError.message, saveError.stack);
        return res.redirect(`/payment-failure?orderId=${orderId}&error=Failed%20to%20save%20order%20status`);
      }
    } else {
      order.paymentStatus = 'Failed';
      console.log(order.paymentStatus, '1111111111111111111');
      
      order.status = 'Failed';
      order.orderedItems.forEach(item => {
        item.status = 'Failed';
      });
      try {
        await order.save();
        console.log('Order updated to Failed due to invalid signature:', orderId);
      } catch (saveError) {
        console.error('Failed to save order:', saveError.message, saveError.stack);
      }
      return res.redirect(`/payment-failure?orderId=${orderId}&error=Invalid%20payment%20signature`);
    }
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error.message, error.stack);
    if (req.body.orderId) {
      const order = await Order.findOne({ orderId: String(req.body.orderId) });
      if (order) {
        order.paymentStatus = 'Failed';
        order.status = 'Failed';
        order.orderedItems.forEach(item => {
          item.status = 'Failed';
        });
        try {
          await order.save();
          console.log('Order updated to Failed due to verification error:', req.body.orderId);
        } catch (saveError) {
          console.error('Failed to save order in catch block:', saveError.message, saveError.stack);
        }
      } else {
        console.error('Order not found in catch block for orderId:', req.body.orderId);
      }
    } else {
      console.error('No orderId provided in catch block');
    }
    return res.redirect(`/payment-failure?orderId=${req.body.orderId || ''}&error=Failed%20to%20verify%20payment`);
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
    if (req.method !== 'GET') {
      return res.status(405).end();
    }

    let orderId = req.query.orderId || req.session.orderId || null;
    const userId = req.session.user?._id;
    console.log('Request:', { url: req.originalUrl, orderId, userId });

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
      .populate('user')
      .populate('orderedItems.product');

    if (!order) {
      console.error('Order not found:', { orderId, userId });
      return res.redirect('/pageNotFound');
    }

    console.log('Order data:', JSON.stringify(order, null, 2));

    let totalOfferDiscount = 0;
    const transformedOrder = {
      ...order.toObject(),
      orderedItems: await Promise.all(
        order.orderedItems.map(async (item) => {
          const product = item.product;
          if (!product) {
            console.warn(`Product not found for item: ${item._id}`);
            return {
              ...item.toObject(),
              product: {
                _id: 'N/A',
                productName: 'Unknown Product',
              },
              offerDiscount: 0,
            };
          }

          const { offer, discount } = await findBestOffer(product._id);

          let offerDiscount = discount * item.quantity;
          totalOfferDiscount += offerDiscount;

          return {
            ...item.toObject(),
            product: {
              _id: product._id || 'N/A',
              productName: product.productName || 'Unknown Product',
            },
            offerDiscount,
          };
        })
      ),
    };

    let deliveryAddress = null;
    if (order.address) {
      const addressDoc = await Address.findOne({ 'address._id': order.address });
      if (addressDoc) {
        const address = addressDoc.address.find(
          (addr) => addr._id.toString() === order.address.toString() && !addr.isDeleted
        );
        deliveryAddress = address
          ? {
              addressType: address.addressType || 'Home',
              name: address.name || '',
              city: address.city || 'Unknown',
              landMark: address.landMark || '',
              state: address.state || 'Unknown',
              pincode: address.pincode?.toString() || '000000',
              phone: address.phone || '',
              altPhone: address.altPhone || '',
            }
          : null;
      }
    }

    if (!deliveryAddress) {
      console.warn('No valid address found for order:', orderId);
    }

    const couponDiscount = order.discount || 0;

    res.render('order-success', {
      order: transformedOrder,
      userName: order.user?.name || userData.name || 'Customer Name',
      deliveryAddress,
      profilePicture: userData.profilePicture || null,
      couponDiscount,
      offerDiscount: totalOfferDiscount,
      title: 'Order Successful - ZAPZONE',
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
    const orderId = req.params.orderId;
    console.log('Fetching order with orderId:', orderId);

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

    let totalOfferDiscount = order.offerDiscount || 0; // Use stored offerDiscount if available
    const transformedOrder = {
      ...order,
      orderedItems: await Promise.all(
        order.orderedItems.map(async (item) => {
          let offerDiscount = item.discount || 0; // Use stored discount if available
          let offerCode = item.offerCode || '';
          const product = item.product;

          // If no stored discount or offerId, recalculate using findBestOffer
          if (!item.offerId || !offerDiscount) {
            const { offer, discount } = await findBestOffer(product?._id);
            if (offer) {
              offerDiscount = discount * item.quantity;
              offerCode = offer.code || '';
            }
          } else {
            // Optionally verify the stored offer is still valid
            const offer = await Offer.findOne({
              _id: item.offerId,
              isListed: true,
              isDeleted: false,
              validFrom: { $lte: new Date() },
              validUpto: { $gte: new Date() },
            });
            if (!offer) {
              // Offer is no longer valid; recalculate
              const { offer: newOffer, discount } = await findBestOffer(product?._id);
              if (newOffer) {
                offerDiscount = discount * item.quantity;
                offerCode = newOffer.code || '';
              } else {
                offerDiscount = 0;
                offerCode = '';
              }
            }
          }

          return {
            ...item,
            product: {
              _id: product?._id || 'N/A',
              productName: product?.productName || 'Unknown Product',
              // Include other product fields if needed
            },
            offerDiscount,
            offerCode,
          };
        })
      ),
    };

    // If order.offerDiscount is not reliable, sum item-level offerDiscount
    if (!order.offerDiscount) {
      totalOfferDiscount = transformedOrder.orderedItems.reduce(
        (sum, item) => sum + (item.offerDiscount || 0),
        0
      );
    }

    const addressDoc = await Address.findOne({ userId });
    let selectedAddress = null;
    if (addressDoc && addressDoc.address && order.address) {
      selectedAddress = addressDoc.address.find(
        (addr) =>
          addr._id.toString() === order.address.toString() && !addr.isDeleted
      );
    }

    const couponDiscount = order.discount || 0;

    res.render("order-detail", {
      order,
      selectedAddress: selectedAddress || null,
      profilePicture: userData.profilePicture || null,
      couponDiscount,
      offerDiscount: totalOfferDiscount,
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
      return res.status(400).json({
        success: false,
        message: 'Order ID and reason are required',
      });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (['Delivered', 'Cancelled', 'Returned'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled. Current Status: ${order.status}`,
      });
    }

    const totalOrderValue = order.totalPrice || order.orderedItems.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    let totalOfferDiscount = 0;
    for (const item of order.orderedItems) {
      if (!['Cancelled', 'Returned'].includes(item.status)) {
        try {
          const { discount } = await findBestOffer(item.product);
          totalOfferDiscount += (discount || 0) * item.quantity;
        } catch (error) {
          console.error(`Error in findBestOffer for product ${item.product}:`, error);
        }
      }
    }

    let couponDiscount = 0;
    if (order.couponApplied && order.discount > 0) {
      couponDiscount = order.discount; 
    }

    const DELIVERY_CHARGE = 50; 
    let refundAmount = totalOrderValue - totalOfferDiscount - couponDiscount;
    if (refundAmount < 0) {
      refundAmount = 0;
    }

    order.status = 'Cancelled';
    order.cancellationReason = reason;
    order.finalAmount = 0;
    order.orderedItems = order.orderedItems.map(item => ({
      ...item,
      status: 'Cancelled',
    }));

    const user = await User.findById(order.user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.wallet = (user.wallet || 0) + refundAmount;

    try {
      await Wallet.create({
        userId: user._id,
        type: 'CREDIT',
        amount: refundAmount,
        reason: `Refund for cancelled order ${order.orderId}`,
        balanceAfter: user.wallet,
      });
    } catch (error) {
      console.error('Error creating wallet transaction:', error);
    }

    for (const item of order.orderedItems) {
      try {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { quantity: item.quantity } },
          { new: true }
        );
      } catch (error) {
        console.error(`Error updating product stock for ${item.product}:`, error);
      }
    }

    await user.save();
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Order cancelled and amount refunded to wallet',
      walletBalance: user.wallet,
      refundDetails: {
        totalOrderValue,
        offerDiscount: totalOfferDiscount,
        couponDiscount,
        deliveryChargeDeducted: DELIVERY_CHARGE,
        finalRefund: refundAmount,
      },
    });
  } catch (error) {
    console.error('Error in cancelOrder:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};

const cancelProduct = async (req, res) => {
  try {
    const { orderId, productId } = req.body;

    if (!orderId || !productId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and Product ID are required',
      });
    }

    if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Order ID or Product ID',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (!['pending', 'processing'].includes(order.status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel product at this stage',
      });
    }

    const productItem = order.orderedItems.find(
      (item) => item.product.toString() === productId.toString()
    );
    if (!productItem) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in order',
      });
    }

    if (['Cancelled', 'Returned'].includes(productItem.status)) {
      return res.status(400).json({
        success: false,
        message: 'Item cannot be cancelled at this stage',
      });
    }

    const productTotal = productItem.price * productItem.quantity;

    let offerDiscount = 0;
    try {
      const { discount } = await findBestOffer(productId);
      offerDiscount = discount || 0;
    } catch (error) {
      console.error(`Error in findBestOffer for product ${productId}:`, error);
    }

    let couponDiscount = 0;
    if (order.couponApplied && order.discount > 0) {
      const totalOrderValue = order.totalPrice || order.orderedItems.reduce((sum, item) => {
        return sum + item.price * item.quantity;
      }, 0);
      
      if (totalOrderValue > 0) {
        const prorationRatio = productTotal / totalOrderValue;
        couponDiscount = order.discount * prorationRatio;
      }
    }

    const DELIVERY_CHARGE = 50; 
    let refundAmount = productTotal - offerDiscount - couponDiscount;
    if (refundAmount < 0) {
      refundAmount = 0; 
    }

    productItem.status = 'Cancelled';

    const newFinalAmount = order.orderedItems.reduce((sum, item) => {
      if (!['Cancelled', 'Returned'].includes(item.status)) {
        return sum + item.price * item.quantity;
      }
      return sum;
    }, 0);

    const allItemsInactive = order.orderedItems.every((item) =>
      ['Cancelled', 'Returned'].includes(item.status)
    );

    if (allItemsInactive) {
      refundAmount = Math.max(0, refundAmount);
      order.status = 'Cancelled';
    }

    order.finalAmount = newFinalAmount;

    const user = await User.findById(order.user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.wallet = (user.wallet || 0) + refundAmount;

    try {
      await Wallet.create({
        userId: user._id,
        type: 'CREDIT',
        amount: refundAmount,
        reason: `Refund for cancelled item in Order ${order.orderId}`,
        balanceAfter: user.wallet,
      });
    } catch (error) {
      console.error('Error creating wallet transaction:', error);
    }

    try {
      await Product.findByIdAndUpdate(
        productId,
        { $inc: { quantity: productItem.quantity } },
        { new: true }
      );
    } catch (error) {
      console.error(`Error updating product stock for ${productId}:`, error);
    }

    await user.save();
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Product cancelled and amount refunded to wallet',
      walletBalance: user.wallet,
      refundDetails: {
        productTotal,
        offerDiscount,
        couponDiscount,
        deliveryChargeDeducted: allItemsInactive ? DELIVERY_CHARGE : 0,
        finalRefund: refundAmount,
      },
    });
  } catch (error) {
    console.error('Error in cancelProduct:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
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

    const coupons = await Coupon.find({
      isActive: true,
      isDeleted: false,
      expiryDate: { $gte: today },
      $expr: { $gt: ["$usageLimit", { $size: "$usedBy" }] }
    }).sort({ createdAt: -1 });

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
    console.log('Full URL:', req.originalUrl);
    console.log('Query parameters:', req.query);
    console.log('Session data:', req.session);

    if (!req.session.user || !req.session.user._id) {
      return res.redirect(`/login?returnUrl=${encodeURIComponent(req.originalUrl)}`);
    }
    const userId = req.session.user._id;
    
    const userData = await User.findById(userId);
    if (!userData) {
      return res.redirect(`/login?returnUrl=${encodeURIComponent(req.originalUrl)}`);
    }
    const error = req.query.error || "Payment failed. Please try again.";
    let orderId = req.query.orderId || req.session.orderId || null;
    console.log('Initial orderId:', orderId);

    if (!orderId) {
      const latestOrder = await Order.findOne({ user: userId }).sort({ createdOn: -1 });
      orderId = latestOrder ? latestOrder.orderId : null;
      console.log('Fetched orderId from DB:', orderId);
    }

    let order = null;
    if (orderId) {
      order = await Order.findOne({ orderId, user: userId });
      if (!order) {
        console.error('Order not found for orderId:', orderId);
        orderId = null;
      }
    }

    console.log('Rendering order-failure with error:', error, 'orderId:', orderId);
    res.render('order-failure', {
      error,
      profilePicture: userData.profilePicture || null,
      orderId: orderId || null
    });

    req.session.orderId = null;
  } catch (error) {
    console.error('Error in loadPaymentFailurePage:', error);
    res.redirect('/pageNotFound');
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    const userId = req.session.user._id;

    if (!orderId || !status) {
      return res.status(400).json({ success: false, message: 'Order ID and status are required' });
    }

    const order = await Order.findOne({ orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = status;
    order.paymentStatus = status === 'Failed' ? 'Failed' : order.paymentStatus;
    order.orderedItems.forEach(item => {
      item.status = status;
    });
    await order.save();

    res.status(200).json({ success: true, message: 'Order status updated' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
};
const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .populate("orderedItems.product")
      .populate("user")
      .lean();

    if (!order) {
      return res.status(404).send("Order not found");
    }

    const addressDoc = await Address.findOne({ userId: order.user._id });
    let selectedAddress = null;
    if (addressDoc && addressDoc.address && order.address) {
      selectedAddress = addressDoc.address.find(
        (addr) => addr._id.toString() === order.address.toString() && !addr.isDeleted
      );
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);

    doc.pipe(res);

    doc
      .fontSize(20)
      .text('ZAPZONE Invoice', { align: 'center' })
      .moveDown();

    doc
      .fontSize(12)
      .text(`Order ID: ${order.orderId}`, { align: 'left' })
      .text(`Order Date: ${new Date(order.createdOn).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
      .text(`Invoice Date: ${order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not available'}`)
      .moveDown();

    doc
      .fontSize(14)
      .text('Shipping Address', { underline: true })
      .fontSize(12);
    if (selectedAddress) {
      doc
        .text(`${selectedAddress.name}`)
        .text(`${selectedAddress.addressType}, ${selectedAddress.landMark}`)
        .text(`${selectedAddress.city}, ${selectedAddress.state} ${selectedAddress.pincode}`)
        .text(`Phone: ${selectedAddress.phone}${selectedAddress.altPhone ? ', Alt: ' + selectedAddress.altPhone : ''}`);
    } else {
      doc.text('Address not available');
    }
    doc.moveDown();

    doc
      .fontSize(14)
      .text('Mode of Payment', { underline: true })
      .fontSize(12)
      .text(order.paymentMethod)
      .moveDown();

    doc
      .fontSize(14)
      .text('Order Items', { underline: true })
      .moveDown(0.5);

    const tableTop = doc.y;
    doc
      .fontSize(12)
      .text('Item', 50, tableTop, { width: 200 })
      .text('Qty', 250, tableTop, { width: 50, align: 'right' })
      .text('Price', 300, tableTop, { width: 100, align: 'right' })
      .text('Total', 400, tableTop, { width: 100, align: 'right' });

    doc
      .moveTo(50, tableTop + 15)
      .lineTo(500, tableTop + 15)
      .stroke();

    let yPosition = tableTop + 25;
    order.orderedItems.forEach(item => {
      const itemTotal = item.price * item.quantity;
      doc
        .text(item.product.productName, 50, yPosition, { width: 200 })
        .text(item.quantity.toString(), 250, yPosition, { width: 50, align: 'right' })
        .text(`₹${item.price.toFixed(2)}`, 300, yPosition, { width: 100, align: 'right' })
        .text(`₹${itemTotal.toFixed(2)}`, 400, yPosition, { width: 100, align: 'right' });
      yPosition += 20;
    });

    doc.moveDown();

    doc
      .fontSize(14)
      .text('Order Summary', { underline: true })
      .moveDown(0.5)
      .fontSize(12)
      .text(`Subtotal: ₹${order.totalPrice.toFixed(2)}`)
      .text(`Discount: ₹${order.discount.toFixed(2)}`)
      .text(`Shipping: ₹50.00`)
      .text(`Grand Total: ₹${order.finalAmount.toFixed(2)}`, { bold: true });

    doc
      .moveDown(2)
      .fontSize(10)
      .text('Thank you for shopping with ZAPZONE!', { align: 'center' })
      .text('Visit us at www.zapzone.com', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).send('Server error');
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
  updateOrderStatus,
  downloadInvoice,
};