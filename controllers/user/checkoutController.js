const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const { login } = require('./userController');

const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    let subtotal = 0;
    const validItems = [];
    if (cart && Array.isArray(cart.items)) {
      cart.items.forEach(item => {
        const product = item.productId;
        const price = item.price;
        const qty = Number(item.quantity);

        if (product && typeof price === 'number' && !isNaN(qty) && !isNaN(price)) {
          subtotal += price * qty;
          validItems.push(item);
        } else {
          console.warn('Skipping invalid cart item in checkout:', {
            productId: product?._id,
            price,
            qty,
            item
          });
        }
      });
    }

    res.render('checkout', {
      cartItems: validItems,
      addresses,
      subtotal: subtotal || 0,
      shippingCharge: 50,
      total: (subtotal || 0) + 50,
      profilePicture: userData.profilePicture || null
    });
  } catch (error) {
    console.error("Error in getCheckoutPage:", error);
    res.redirect('/pageNotFound');
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId } = req.body;

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    const addressDoc = await Address.findOne({ userId });

    const deliveryAddress = addressDoc?.address.find(address => 
      address._id.toString() === addressId.toString()
    );
    

    if (!cart || !cart.items.length || !deliveryAddress) {
      console.warn('Invalid order data:', {
        hasCart: !!cart,
        hasItems: cart?.items.length,
        hasAddress: !!deliveryAddress
      });
      return res.redirect('/pageNotFound');
    }

    const cartItems = cart.items;
    const validItems = [];

   
    for (const item of cartItems) {
      if (
        !item.productId ||
        typeof item.productId.quantity !== 'number' ||
        item.productId.quantity < item.quantity ||
        typeof item.price !== 'number' ||
        isNaN(item.price)
      ) {
        console.warn('Skipping invalid item in placeOrder:', {
          productId: item.productId?._id,
          productQuantity: item.productId?.quantity,
          itemPrice: item.price,
          itemQuantity: item.quantity
        });
        continue;
      }
      validItems.push(item);
    }

    if (!validItems.length) {
      console.error('No valid items to process order:', { cartItems });
      return res.redirect('/pageNotFound');
    }

    let totalPrice = 0;
    const orderedItems = validItems.map(item => {
      const itemTotal = item.price * item.quantity;
      totalPrice += itemTotal;
      return {
        product: item.productId._id,
        quantity: item.quantity,
        price: item.price
      };
    });

    if (isNaN(totalPrice) || totalPrice <= 0) {
      console.error('Invalid total price:', { totalPrice, orderedItems });
      return res.redirect('/pageNotFound');
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
      status: 'pending',
      createdOn: new Date(),
      couponApplied: false,
      user: req.session.user._id,
    });

    await newOrder.save();
   console.log('orderId:',newOrder.orderId);
   
    for (const item of validItems) {
      item.productId.quantity -= item.quantity;
      await item.productId.save();
    }

    await Cart.deleteOne({ userId });
    
    req.session.orderId = newOrder.orderId;
    res.redirect('/order-success');
  } catch (error) {
    console.error("Error in placeOrder:", error);
    res.redirect('/pageNotFound');
  }
};
const loadOrderSuccessPage = async (req, res) => {
  try {
    const orderId = req.session.orderId;
    const userId = req.session.user._id;

    const order = await Order.findOne({ orderId, user: userId })
      .populate('orderedItems.product')
      .populate('address');

    if (!order) {
      return res.redirect('/pageNotFound');
    }

    res.render('order-success', { order });
  } catch (error) {
    console.log(error.message);
    res.redirect('/pageNotFound');
  }
};
const loadOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    const orders = await Order.find({ user: userId })
      .populate('orderedItems.product')
      .sort({ createdOn: -1 });

    console.log(orders.map(order => order.orderedItems));
    console.log(userId);

    res.render('orders', { 
      orders, 
      user: userData,
      userData,  
      profilePicture: 
      userData.profilePicture || null });
  } catch (error) {
    console.error(error);
    res.render('orders', { orders: [], user: req.user, error: 'Failed to load orders' });
  }
};


module.exports = {
  getCheckoutPage,
  placeOrder,
  loadOrderSuccessPage,
  loadOrders,
  
};