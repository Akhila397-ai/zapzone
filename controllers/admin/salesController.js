const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Brand = require('../../models/brandSchema');
const Order = require('../../models/orderSchema');

const loadDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfToday.getDate() - 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const todaySales = await Order.aggregate([
      { $match: { status: 'Delivered', createdOn: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const yesterdaySales = await Order.aggregate([
      {
        $match: {
          status: 'Delivered',
          createdOn: { $gte: startOfYesterday, $lt: startOfToday },
        },
      },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const monthlySales = await Order.aggregate([
      { $match: { status: 'Delivered', createdOn: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const yearlySales = await Order.aggregate([
      { $match: { status: 'Delivered', createdOn: { $gte: startOfYear } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    res.render('dashboard', {
      todaySales: todaySales[0]?.total || 0,
      yesterdaySales: yesterdaySales[0]?.total || 0,
      monthlySales: monthlySales[0]?.total || 0,
      yearlySales: yearlySales[0]?.total || 0,
    });
  } catch (error) {
    console.error('Error loading dashboard:', error.message, error.stack);
    res.status(500).render('PageNotFound', { message: 'Failed to load dashboard' });
  }
};

const getDashboardData = async (req, res) => {
  try {
    const { filter } = req.params;

    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(filter)) {
      return res.status(400).json({ message: 'Invalid filter. Use "daily", "weekly", "monthly", or "yearly".' });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfToday.getDate() - 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Define date range for sales data
    let dateRange;
    if (filter === 'daily') {
      dateRange = { $gte: startOfMonth }; // Last 30 days
    } else if (filter === 'weekly') {
      dateRange = { $gte: startOfYear }; // Last year
    } else if (filter === 'monthly') {
      dateRange = { $gte: new Date(now.getFullYear() - 1, 0, 1) }; // Last 1-2 years
    } else if (filter === 'yearly') {
      dateRange = { $gte: new Date(now.getFullYear() - 5, 0, 1) }; // Last 5 years
    }

    let groupByFormat, labelFormat;
    if (filter === 'daily') {
      groupByFormat = {
        year: { $year: '$createdOn' },
        month: { $month: '$createdOn' },
        day: { $dayOfMonth: '$createdOn' },
      };
      labelFormat = '%d/%m/%Y';
    } else if (filter === 'weekly') {
      groupByFormat = {
        year: { $year: '$createdOn' },
        week: { $week: '$createdOn' },
      };
      labelFormat = 'Week %U/%Y';
    } else if (filter === 'monthly') {
      groupByFormat = {
        year: { $year: '$createdOn' },
        month: { $month: '$createdOn' },
      };
      labelFormat = '%m/%Y';
    } else if (filter === 'yearly') {
      groupByFormat = { $year: '$createdOn' };
      labelFormat = '%Y';
    }

    const todaySales = await Order.aggregate([
      { $match: { status: 'Delivered', createdOn: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const yesterdaySales = await Order.aggregate([
      {
        $match: {
          status: 'Delivered',
          createdOn: { $gte: startOfYesterday, $lt: startOfToday },
        },
      },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const monthlySales = await Order.aggregate([
      { $match: { status: 'Delivered', createdOn: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const yearlySales = await Order.aggregate([
      { $match: { status: 'Delivered', createdOn: { $gte: startOfYear } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const salesData = await Order.aggregate([
      { $match: { status: 'Delivered', createdOn: dateRange } },
      {
        $group: {
          _id: groupByFormat,
          totalSales: { $sum: '$finalAmount' },
          firstDate: { $min: '$createdOn' },
        },
      },
      {
        $project: {
          _id: 0,
          label: {
            $dateToString: { format: labelFormat, date: '$firstDate' },
          },
          totalSales: 1,
          sortDate: '$firstDate',
        },
      },
      { $sort: { sortDate: 1 } },
    ]);

    const salesLabels = salesData.map((d) => d.label);
    const salesValues = salesData.map((d) => d.totalSales);

    const products = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $match: {
          'orderedItems.status': { $nin: ['Cancelled', 'Returned', 'Return Rejected'] },
        },
      },
      {
        $group: {
          _id: '$orderedItems.product',
          totalSold: { $sum: '$orderedItems.quantity' },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      { $unwind: '$productDetails' },
      {
        $match: {
          'productDetails.isDeleted': false,
          'productDetails.isBlocked': false,
        },
      },
      {
        $project: {
          label: '$productDetails.productName',
          totalSold: 1,
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]);

    const productLabels = products.map((p) => p.label);
    const productValues = products.map((p) => p.totalSold);

    const categories = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $match: {
          'orderedItems.status': { $nin: ['Cancelled', 'Returned', 'Return Rejected'] },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      { $unwind: '$productDetails' },
      {
        $match: {
          'productDetails.isDeleted': false,
          'productDetails.isBlocked': false,
        },
      },
      {
        $group: {
          _id: '$productDetails.category',
          totalRevenue: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.price'] } },
        },
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryDetails',
        },
      },
      { $unwind: '$categoryDetails' },
      {
        $match: {
          'categoryDetails.isDeleted': false,
        },
      },
      {
        $project: {
          label: '$categoryDetails.name',
          totalRevenue: 1,
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    const categoryLabels = categories.map((c) => c.label);
    const categoryValues = categories.map((c) => c.totalRevenue);

    const brands = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $unwind: '$orderedItems' },
      {
        $match: {
          'orderedItems.status': { $nin: ['Cancelled', 'Returned', 'Return Rejected'] },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      { $unwind: '$productDetails' },
      {
        $match: {
          'productDetails.isDeleted': false,
          'productDetails.isBlocked': false,
        },
      },
      {
        $group: {
          _id: '$productDetails.brand',
          totalRevenue: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.price'] } },
        },
      },
      {
        $lookup: {
          from: 'brands',
          localField: '_id',
          foreignField: '_id',
          as: 'brandDetails',
        },
      },
      { $unwind: '$brandDetails' },
      {
        $match: {
          'brandDetails.isDeleted': false,
          'brandDetails.isListed': true,
        },
      },
      {
        $project: {
          label: '$brandDetails.name',
          totalRevenue: 1,
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    const brandLabels = brands.map((b) => b.label);
    const brandValues = brands.map((b) => b.totalRevenue);

    const statusData = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          label: '$_id',
          count: 1,
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
    ]);

    const statusLabels = statusData.map((s) => s.label);
    const statusValues = statusData.map((s) => s.count);

    const recentOrders = await Order.find()
      .sort({ createdOn: -1 })
      .limit(10)
      .populate('user', 'name')
      .lean();

    const formattedRecentOrders = recentOrders.map((order) => ({
      orderId: order.orderId,
      customerName: order.user?.name || 'Unknown',
      createdOn: order.createdOn,
      amount: order.finalAmount,
      status: order.status,
    }));

    res.json({
      todaySales: todaySales[0]?.total || 0,
      yesterdaySales: yesterdaySales[0]?.total || 0,
      monthlySales: monthlySales[0]?.total || 0,
      yearlySales: yearlySales[0]?.total || 0,
      sales: {
        labels: salesLabels,
        data: salesValues,
      },
      products: {
        labels: productLabels,
        data: productValues,
      },
      categories: {
        labels: categoryLabels,
        data: categoryValues,
      },
      brands: {
        labels: brandLabels,
        data: brandValues,
      },
      status: {
        labels: statusLabels,
        data: statusValues,
      },
      recentOrders: formattedRecentOrders,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error.message, error.stack);
    res.status(500).json({ message: 'Error fetching dashboard data', error: error.message });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.query;
    const order = await Order.findOne({ orderId })
      .populate('user', 'name')
      .populate('address')
      .populate({
        path: 'orderedItems.product',
        select: 'productName salePrice productImage',
      })
      .lean();

    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }

    const orderItems = order.orderedItems.map((item) => ({
      product: {
        productName: item.product?.productName || 'Unknown',
        productImage: item.product?.productImage || [],
        salePrice: item.product?.salePrice || 0,
      },
      stock: item.quantity,
      price: item.price,
    }));

    res.json({
      success: true,
      order: {
        orderId: order.orderId,
        createdOn: order.createdOn,
        status: order.status,
        orderItems,
        totalPrice: order.totalPrice || 0,
        discount: order.discount || 0,
        couponDiscount: order.couponApplied ? order.discount : 0,
        finalAmount: order.finalAmount || 0,
        userId: { name: order.user?.name || 'Unknown' },
        address: order.address ? [order.address] : [],
        paymentMethod: order.paymentMethod || 'N/A',
        ReturnReason: order.returnReason || '',
      },
    });
  } catch (error) {
    console.error('Error fetching order details:', error.message, error.stack);
    res.status(500).json({ message: 'Error fetching order details', error: error.message });
  }
};

module.exports = {
  loadDashboard,
  getDashboardData,
  getOrderDetails,
};