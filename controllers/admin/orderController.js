const User =require('../../models/userSchema')
const Order =require('../../models/orderSchema')
const Address =require('../../models/addressSchema')
const Product =require('../../models/productSchema')
const Wallet = require('../../models/walletSchema')

const getOrders = async (req, res) => {
  try {
    const { search = '', status = '', page = 1 } = req.query;
    const limit = 10;

    console.log('Query parameters:', req.query);

    const query = {};
    const trimmedSearch = search.trim();

    if (trimmedSearch) {
      const escapedSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const users = await User.find({
        name: { $regex: escapedSearch, $options: 'i' },
      }).select('_id name');
      const matchedUserIds = users.map((u) => u._id);

      console.log('Matched users:', users.map((u) => u.name));
      console.log('Matched user IDs:', matchedUserIds);

      query.$or = [
        { orderId: { $regex: escapedSearch, $options: 'i' } },
        { user: { $in: matchedUserIds } },
      ];
    }

    if (status) {
      query.status = status;
    }

    console.log('MongoDB query:', JSON.stringify(query, null, 2));

    const orders = await Order.find(query)
      .populate({
        path: 'user',
        select: 'name',
      })
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    console.log(
      'Orders:',
      orders.map((o) => ({
        orderId: o.orderId,
        user: o.user ? o.user.name : 'Unknown User',
      }))
    );

    const count = await Order.countDocuments(query);

    console.log('Total count:', count);

    res.render('orders', {
      orders,
      currentPage: Number(page),
      totalPages: Math.ceil(count / limit),
      search,
      status,
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    let errorMessage = 'Server Error: Unable to fetch orders';
    if (err.name === 'MongoServerError') {
      errorMessage = 'Database query failed';
    }
    res.status(500).render('error', { message: errorMessage });
  }
};


const getOrderDetail = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findOne({ orderId })
      .populate('user')
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).send("Order not found");
    }

    console.log('Ordered Items:', JSON.stringify(order.orderedItems, null, 2));

    const addressDoc = await Address.findOne({ userId: order.user._id });
    console.log('Address Document:', addressDoc);

    let selectedAddress = null;
    if (addressDoc && Array.isArray(addressDoc.address)) {
      selectedAddress = addressDoc.address.find(
        (addr) => addr._id.toString() === order.address.toString() && !addr.isDeleted
      );
    }

    if (!addressDoc) {
      console.log('No address document found for user:', order.user._id);
    }
    if (!selectedAddress) {
      console.log('No matching sub-address found for order.address:', order.address);
    }
    console.log("Cancellation Reason:", order.cancellationReason);
    console.log(
      "Return Reasons:",
      order.orderedItems.map((item) => ({
        productId: item.product._id,
        returnReason: item.returnReason,
      }))
    );

    let offerDiscount = order.offerDiscount || 0;
    if (!offerDiscount) {
      offerDiscount = order.orderedItems.reduce(
        (sum, item) => sum + (item.discount || 0) * item.quantity,
        0
      );
    }

    const couponDiscount = order.discount || 0;

    const shippingCharge = 50.00;

    res.render('orderDetails', {
      order,
      selectedAddress,
      cancellationReason: order.cancellationReason || null,
      couponDiscount,
      offerDiscount,
      shippingCharge
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('error', { message: 'Server error while fetching order details' });
  }
};
  const updateOrderStatus = async (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;
  
    console.log('Received update request:', { orderId, status });
  
    const validStatuses = ['pending', 'processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned','Return Rejected'];
    if (!validStatuses.includes(status)) {
      console.log('Invalid status:', status);
      return res.status(400).json({ message: 'Invalid status value' });
    }
  
    try {
      const updatedOrder = await Order.findOneAndUpdate(
        { orderId },
        { $set: { status } },
        { new: true }
      );
  
      if (!updatedOrder) {
        console.log('Order not found for orderId:', orderId);
        return res.status(404).json({ message: 'Order not found' });
      }
  
      res.status(200).json({ message: 'Order status updated successfully' });
    } catch (err) {
      console.error('Error updating order status:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

 const approveReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { itemId } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      console.log("Order not found for orderId:", orderId);
      return res.status(404).json({success:false, message: "Order not found" });
    }
    console.log(order,'111111111');
    
    const item = order.orderedItems.find(
      (i) => i.product.toString() === itemId
    );
    console.log(item,'222222222');
    
    if (!item || item.status !== "Return Requested") {
      console.log("Invalid return request for itemId:", itemId);
      return res.status(400).json({success:false, message: "Invalid return request" });
    }

    item.status = "Returned";

    const product = await Product.findById(item.product);
    if (product) {
      product.quantity += item.quantity;
      await product.save();
    }

    const newFinalAmount = order.orderedItems.reduce((sum, item) => {
      if (!item.status || (item.status !== "Cancelled" && item.status !== "Returned")) {
        return sum + item.price * item.quantity;
      }
      return sum;
    }, 0);

    const deliveryCharge = 50;
    const refundAmount = order.finalAmount - newFinalAmount - deliveryCharge;
    order.finalAmount = newFinalAmount > 0 ? newFinalAmount : 0;

    const allItemsInactive = order.orderedItems.every(
      (item) => item.status === "Cancelled" || item.status === "Returned"
    );
    if (allItemsInactive) {
      order.status = "Returned";
    }
    const user = await User.findById(order.user);
    if (user && refundAmount > 0) {
      const currentWallet = Number(user.wallet) || 0;
      user.wallet = currentWallet + refundAmount;
      await user.save();

      await Wallet.create({
        userId: user._id,
        type: 'CREDIT',
        amount: refundAmount,
        reason: `Refund for returned item in Order ${order.orderId} (after deducting delivery charge of ${deliveryCharge})`,
        balanceAfter: user.wallet
      });
    }

    await order.save();

    res.status(200).json({success:true, message: "Return approved successfully and amount refunded to wallet" });
  } catch (error) {
    console.error("Error approving return:", error);
    res.status(500).json({success:false, message: "Server error" });
  }
};


  const rejectReturn = async (req, res) => {
    try {
      const orderId = req.params.id;
      const { itemId } = req.body;
  
      const order = await Order.findOne({ orderId });
      if (!order) {
        console.log("Order not found for orderId:", orderId);
        return res.status(404).json({ message: "Order not found" });
      }
  
      const item = order.orderedItems.find(
        (i) => i.product.toString() === itemId
      );
      console.log(item,'221111');
      
      if (!item || item.status !== "Return Requested") {
        console.log("Invalid return request for itemId:", itemId,erro);
        return res.status(400).json({ message: "Invalid return request" });
      }
  
      item.status = "Delivered";
  
      await order.save();
  
      res.status(200).json({ message: "Return rejected successfully" });
    } catch (error) {
      console.error("Error rejecting return:", error);
      res.status(500).json({ message: "Server error" });
    }
  };


    module.exports={getOrders,getOrderDetail,updateOrderStatus,approveReturn,rejectReturn}
