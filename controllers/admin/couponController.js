const Coupon = require('../../models/couponSchema');
const User =require('../../models/userSchema')
const Order =require('../../models/orderSchema')
const Address =require('../../models/addressSchema')
const Product =require('../../models/productSchema')
const mongoose = require('mongoose');

const isValidDate = (date) => {
  const today = new Date().setHours(0, 0, 0, 0);
  const inputDate = new Date(date).setHours(0, 0, 0, 0);
  return inputDate >= today;
};

const listCoupons = async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let query = { isActive: true, isDeleted: false };
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } }, 
        { name: { $regex: search, $options: 'i' } }  
      ];
    }

    const totalCoupons = await Coupon.countDocuments(query);

    const coupons = await Coupon.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalCoupons / limit);

    res.render('coupons', {
      coupons,
      currentPage: page,
      totalPages,
      search
    });
  } catch (error) {
    console.error('Error loading coupons:', error);
    res.status(500).send('Error loading coupons');
  }
};

const addCoupon = async (req, res) => {
  try {
    const { name, code, minCartValue, discountType, discount, maxDiscount, validFrom, expiry } = req.body;

    // Validate required fields
    if (!name || !code || !minCartValue || !discountType || !discount || !validFrom || !expiry) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate coupon code
    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      return res.status(400).json({ message: 'Coupon code must be 4-10 alphanumeric characters' });
    }

    // Validate min cart value
    if (isNaN(minCartValue) || minCartValue < 0) {
      return res.status(400).json({ message: 'Minimum cart value must be a non-negative number' });
    }

    // Validate discount type
    if (!['fixed', 'percentage'].includes(discountType)) {
      return res.status(400).json({ message: 'Invalid discount type' });
    }

    // Validate discount amount
    if (isNaN(discount) || discount < 1) {
      return res.status(400).json({ message: 'Discount amount must be at least 1' });
    }
    if (discountType === 'percentage' && discount > 100) {
      return res.status(400).json({ message: 'Percentage discount cannot exceed 100%' });
    }

    // Validate max discount for percentage type
    if (discountType === 'percentage' && (isNaN(maxDiscount) || maxDiscount < 0)) {
      return res.status(400).json({ message: 'Maximum discount must be a non-negative number' });
    }

    // Validate dates
    if (!isValidDate(validFrom)) {
      return res.status(400).json({ message: 'Valid from date must be today or in the future' });
    }
    const validFromDate = new Date(validFrom);
    const expiryDate = new Date(expiry);
    if (expiryDate < validFromDate) {
      return res.status(400).json({ message: 'Expiry date must be after valid from date' });
    }

    // Check for existing coupon code
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const coupon = new Coupon({
      name,
      code: code.toUpperCase(),
      discountType,
      discountAmount: parseFloat(discount),
      maxDiscount: discountType === 'percentage' ? parseFloat(maxDiscount) : null,
      minOrderAmount: parseFloat(minCartValue),
      validFrom: validFromDate,
      expiryDate: expiryDate,
      isActive: true,
    });

    await coupon.save();

    res.status(201).json({ message: 'Coupon created successfully', coupon });
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const editCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const { name, code, minCartValue, discountType, discount, maxDiscount, validFrom, expiry } = req.body;

    if (!name || !code || !minCartValue || !discountType || !discount || !validFrom || !expiry) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!mongoose.isValidObjectId(couponId)) {
      return res.status(400).json({ message: 'Invalid coupon ID' });
    }

    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      return res.status(400).json({ message: 'Coupon code must be 4-10 alphanumeric characters' });
    }

    // Validate min cart value
    if (isNaN(minCartValue) || minCartValue < 0) {
      return res.status(400).json({ message: 'Minimum cart value must be a non-negative number' });
    }

    if (!['fixed', 'percentage'].includes(discountType)) {
      return res.status(400).json({ message: 'Invalid discount type' });
    }

    if (isNaN(discount) || discount < 1) {
      return res.status(400).json({ message: 'Discount amount must be at least 1' });
    }
    if (discountType === 'percentage' && discount > 100) {
      return res.status(400).json({ message: 'Percentage discount cannot exceed 100%' });
    }

    if (discountType === 'percentage' && (isNaN(maxDiscount) || maxDiscount < 0)) {
      return res.status(400).json({ message: 'Maximum discount must be a non-negative number' });
    }

    if (!isValidDate(validFrom)) {
      return res.status(400).json({ message: 'Valid from date must be today or in the future' });
    }
    const validFromDate = new Date(validFrom);
    const expiryDate = new Date(expiry);
    if (expiryDate < validFromDate) {
      return res.status(400).json({ message: 'Expiry date must be after valid from date' });
    }

    const existingCoupon = await Coupon.findOne({
      code: code.toUpperCase(),
      _id: { $ne: couponId },
    });
    if (existingCoupon) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      {
        name,
        code: code.toUpperCase(),
        discountType,
        discountAmount: parseFloat(discount),
        maxDiscount: discountType === 'percentage' ? parseFloat(maxDiscount) : null,
        minOrderAmount: parseFloat(minCartValue),
        validFrom: validFromDate,
        expiryDate: expiryDate,
      },
      { new: true }
    );

    if (!updatedCoupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.status(200).json({ message: 'Coupon updated successfully', coupon: updatedCoupon });
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const activateCoupon = async (req, res) => {
  try {
    const couponId = req.query.id;
    
    if (!mongoose.isValidObjectId(couponId)) {
      return res.status(400).json({ message: 'Invalid coupon ID' });
    }

    const coupon = await Coupon.findByIdAndUpdate(
      couponId,
      { isActive: true },
      { new: true }
    );

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.status(200).json({ message: 'Coupon activated successfully', coupon });
  } catch (error) {
    console.error('Error activating coupon:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deactivateCoupon = async (req, res) => {
  try {
    const couponId = req.query.id;

    if (!mongoose.isValidObjectId(couponId)) {
      return res.status(400).json({ message: 'Invalid coupon ID' });
    }

    const coupon = await Coupon.findByIdAndUpdate(
      couponId,
      { isActive: false },
      { new: true }
    );

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    res.status(200).json({ success: true, message: 'Coupon deactivated successfully', coupon });
  } catch (error) {
    console.error('Error deactivating coupon:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;

    if (!mongoose.isValidObjectId(couponId)) {
      return res.status(400).json({ message: 'Invalid coupon ID' });
    }

    const coupon = await Coupon.findByIdAndUpdate(
      couponId,
      { isActive: false, isDeleted: true },
      { new: true }
    );

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.status(200).json({ message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  listCoupons,
  addCoupon,
  editCoupon,
  activateCoupon,
  deactivateCoupon,
  deleteCoupon,
};