const User =require('../../models/userSchema')
const Order =require('../../models/orderSchema')
const Address =require('../../models/addressSchema')
const Product =require('../../models/productSchema')

const getOrders = async (req, res) => {
  try {
    const { search = '', status = '', page = 1 } = req.query;
    const limit = 10;

    const query = {};
    const trimmedSearch = search.trim();

    let matchedUserIds = [];

    if (trimmedSearch) {
      const users = await User.find({
        name: { $regex: trimmedSearch, $options: 'i' },
      }).select('_id');

      matchedUserIds = users.map((u) => u._id);

      query.$or = [
        { orderId: { $regex: new RegExp(trimmedSearch, 'i') } }, 
        { user: { $in: matchedUserIds } },
      ];
    }

    if (status) {
      query.status = status;
    }

    console.log('Query parameters:', req.query);
    console.log('MongoDB query:', JSON.stringify(query));

    const orders = await Order.find(query)
      .populate('user')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    console.log(
      'Raw orders:',
      orders.map((o) => ({
        orderId: o.orderId,
        user: o.user ? o.user.name : 'null',
      }))
    );

    const filteredOrders = trimmedSearch
      ? orders.filter((order) => {
          const orderIdMatch = order.orderId?.match(new RegExp(trimmedSearch, 'i'));
          const userNameMatch =
            order.user?.name?.match(new RegExp(trimmedSearch, 'i'));
          console.log(
            `Order ${order.orderId}: orderIdMatch=${!!orderIdMatch}, userNameMatch=${!!userNameMatch}`
          );
          return orderIdMatch || userNameMatch;
        })
      : orders;

    console.log(
      'Filtered orders:',
      filteredOrders.map((o) => ({
        orderId: o.orderId,
        user: o.user ? o.user.name : 'null',
      }))
    );

    const count = await Order.countDocuments(query);

    console.log('Total count:', count);

    res.render('orders', {
      orders: filteredOrders,
      currentPage: Number(page),
      totalPages: Math.ceil(count / limit),
      search,
      status,
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).send('Server Error');
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
  
      res.render('orderDetails', { order, selectedAddress ,cancellationReason: order.cancellationReason || null, });
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
        return res.status(404).json({ message: "Order not found" });
      }
  
      const item = order.orderedItems.find(
        (i) => i.product.toString() === itemId
      );
      if (!item || item.status !== "Return Requested") {
        console.log("Invalid return request for itemId:", itemId);
        return res.status(400).json({ message: "Invalid return request" });
      }
  
      item.status = "Returned";
       const product = await Product.findById(item.product);
      console.log(product,'dgv');
      


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
  
      order.finalAmount = newFinalAmount > 0 ? newFinalAmount : 0;
  
      const allItemsInactive = order.orderedItems.every(
        (item) => item.status === "Cancelled" || item.status === "Returned"
      );
      if (allItemsInactive) {
        order.status = "Returned";
      }
     
  
      await order.save();
  
      res.status(200).json({ message: "Return approved successfully" });
    } catch (error) {
      console.error("Error approving return:", error);
      res.status(500).json({ message: "Server error" });
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
      if (!item || item.status !== "Return Requested") {
        console.log("Invalid return request for itemId:", itemId);
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
