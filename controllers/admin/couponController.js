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
const listCoupons = async(req,res)=>{
    try {
        
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.render('coupons', { coupons }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading coupons');
  }
}
const addCoupon = async (req, res) => {
  try {

    const { name, code, minCartValue, discount, validFrom, expiry,couponDiscount } = req.body; 

    if (!name || !code || !minCartValue || !discount || !validFrom || !expiry ) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      return res.status(400).json({ message: 'Coupon code must be 4-10 alphanumeric characters' });
    }

    if (isNaN(minCartValue) || minCartValue < 0) {
      return res.status(400).json({ message: 'Minimum cart value must be a non-negative number' });
    }

    if (isNaN(discount) || discount < 1) {
      return res.status(400).json({ message: 'Coupon amount must be at least 1' });
    }

    if (!isValidDate(validFrom)) {
      return res.status(400).json({ message: 'Valid from date must be today or in the future' });
    }

    const validFromDate = new Date(validFrom);
    const expiryDate = new Date(expiry);
    if (expiryDate < validFromDate) {
      return res.status(400).json({ message: 'Expiry date must be after valid from date' });
    }

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const coupon = new Coupon({
      name,
      minCartValue,
      couponDiscount,
      code: code.toUpperCase(),
      discountType: 'fixed', 
      discountAmount: parseFloat(discount),
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
    const { name, code, minCartValue, discount, validFrom, expiry } = req.body;

    if (!name || !code || !minCartValue || !discount || !validFrom || !expiry) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!mongoose.isValidObjectId(couponId)) {
      return res.status(400).json({ message: 'Invalid coupon ID' });
    }

    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      return res.status(400).json({ message: 'Coupon code must be 4-10 alphanumeric characters' });
    }

    if (isNaN(minCartValue) || minCartValue < 0) {
      return res.status(400).json({ message: 'Minimum cart value must be a non-negative number' });
    }

    if (isNaN(discount) || discount < 1) {
      return res.status(400).json({ message: 'Coupon amount must be at least 1' });
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
      minCartValue,
      code: code.toUpperCase(),
      discountType: 'fixed', 
      discountAmount: parseFloat(discount),
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
    console.log("=======================================");
    
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
      return res.status(404).json({success:false, message: 'Coupon not found' });
    }

    res.status(200).json({success:true, message: 'Coupon deactivated successfully', coupon });
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

module.exports={
    listCoupons,
    addCoupon,
    editCoupon,
    activateCoupon,
    deactivateCoupon,
    deleteCoupon,
}



