const Offer = require('../../models/offerSchema')
const Category =require('../../models/categorySchema')
const Product = require('../../models/productSchema')

const getOffers = async (req, res) => {
  try {
    const perPage = 10;
    const page = parseInt(req.query.page) || 1;
    const searchQuery = req.query.search || '';

   const query = {
  $and: [
    {
      $or: [
        { couponName: { $regex: searchQuery, $options: 'i' } },
        { code: { $regex: searchQuery, $options: 'i' } }
      ]
    },
    { isDeleted: false }
  ]
};

    const categories = await Category.find({}).select('name').lean();
    console.log(categories);
    
    const products = await Product.find({}).select('productName').lean();

    const totalOffers = await Offer.countDocuments(query);
    const offers = await Offer.find(query)
      .skip((page - 1) * perPage)
      .limit(perPage)
      .sort({ createdAt: -1 })
      .populate({
        path: 'applicableTo',
        select: 'name productName'
      });
      console.log(offers);
      

    res.render('offer', {
      offers,
      currentPage: page,
      totalPages: Math.ceil(totalOffers / perPage),
      searchQuery,
      categories: categories.map(cat => cat.name),
      products: products.map(prod => prod.productName)
    });
  } catch (err) {
    console.error('Error fetching offers:', err);
    res.status(500).send('Server Error');
  }
};


const addOffer = async (req, res) => {
  try {
    const {
      offerName,
      description,
      discountType,
      discountAmount,
      validFrom,
      validUpto,
      offerType,
      applicableTo,
      code,
      minPurchase
    } = req.body;

    if (!offerName || !description || !discountType || !discountAmount || !validFrom || !validUpto || !offerType || !applicableTo || !code || !minPurchase) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const validFromDate = new Date(validFrom);
    const validUptoDate = new Date(validUpto);
    const currentDate = new Date();
    if (isNaN(validFromDate) || isNaN(validUptoDate)) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }
    if (validFromDate > validUptoDate) {
      return res.status(400).json({ success: false, message: 'Valid From date must be before Valid Upto date' });
    }
    if (validUptoDate < currentDate) {
      return res.status(400).json({ success: false, message: 'Valid Upto date cannot be in the past' });
    }

    const discountAmt = parseFloat(discountAmount);
    const minPurch = parseFloat(minPurchase);
    if (discountAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Discount amount must be greater than 0' });
    }
    if (minPurch < 0) {
      return res.status(400).json({ success: false, message: 'Minimum purchase cannot be negative' });
    }
    if (discountType === 'percentage' && discountAmt > 100) {
      return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%' });
    }

    const existingOffer = await Offer.findOne({
      $or: [{ offerName: offerName.trim() }, { code: code.trim().toUpperCase() }],
      isDeleted: false
    });
    if (existingOffer) {
      return res.status(400).json({
        success: false,
        message: existingOffer.offerName === offerName.trim() ? 'Offer name already exists' : 'Offer code already exists'
      });
    }

    let applicableToRef;
    if (offerType === 'category') { // Changed 'Category' to 'category'
      const category = await Category.findOne({ name: applicableTo, isDeleted: false });
      if (!category) {
        return res.status(400).json({ success: false, message: 'Invalid category selected' });
      }
      applicableToRef = category._id;
    } else if (offerType === 'product') { // Changed 'Product' to 'product'
      const product = await Product.findOne({ productName: applicableTo, isDeleted: false });
      if (!product) {
        return res.status(400).json({ success: false, message: 'Invalid product selected' });
      }
      applicableToRef = product._id;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid offer type' });
    }

    const newOffer = new Offer({
      offerName: offerName.trim(),
      description: description.trim(),
      discountType,
      discountAmount: discountAmt,
      validFrom: validFromDate,
      validUpto: validUptoDate,
      offerType,
      applicableTo: applicableToRef,
      offerTypeRef: offerType, 
      code: code.trim().toUpperCase(),
      minPurchase: minPurch,
      isListed: true,
      isDeleted: false
    });

    await newOffer.save();

    res.status(200).json({ success: true, message: 'Offer created successfully', redirect: '/admin/offers' });
  } catch (err) {
    console.error('Error adding offer:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `Duplicate ${field}: ${err.keyValue[field]} already exists`
      });
    }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


const editOffer = async (req, res) => {
  try {
    const {
      id,
      offerName,
      description,
      discountType,
      discountAmount,
      validFrom,
      validUpto,
      offerType,
      applicableTo,
      code,
      minPurchase
    } = req.body;

    if (!id || !offerName || !description || !discountType || !discountAmount || !validFrom || !validUpto || !offerType || !applicableTo || !code || !minPurchase) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const validFromDate = new Date(validFrom);
    const validUptoDate = new Date(validUpto);
    const currentDate = new Date();
    if (isNaN(validFromDate) || isNaN(validUptoDate)) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }
    if (validFromDate > validUptoDate) {
      return res.status(400).json({ success: false, message: 'Valid From date must be before Valid Upto date' });
    }

    const discountAmt = parseFloat(discountAmount);
    const minPurch = parseFloat(minPurchase);
    if (discountAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Discount amount must be greater than 0' });
    }
    if (minPurch < 0) {
      return res.status(400).json({ success: false, message: 'Minimum purchase cannot be negative' });
    }
    if (discountType === 'percentage' && discountAmt > 100) {
      return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%' });
    }

    const existingOffer = await Offer.findOne({
      $or: [{ offerName: offerName.trim() }, { code: code.trim().toUpperCase() }],
      isDeleted: false,
      _id: { $ne: id } 
    });
    if (existingOffer) {
      return res.status(400).json({
        success: false,
        message: existingOffer.offerName === offerName.trim() ? 'Offer name already exists' : 'Offer code already exists'
      });
    }

    let applicableToRef;
    if (offerType === 'category') { // Already correct
      const category = await Category.findOne({ name: applicableTo, isDeleted: false });
      if (!category) {
        return res.status(400).json({ success: false, message: 'Invalid category selected' });
      }
      applicableToRef = category._id;
    } else if (offerType === 'product') { // Changed 'Product' to 'product'
      const product = await Product.findOne({ productName: applicableTo, isDeleted: false });
      if (!product) {
        return res.status(400).json({ success: false, message: 'Invalid product selected' });
      }
      applicableToRef = product._id;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid offer type' });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      id,
      {
        offerName: offerName.trim(),
        description: description.trim(),
        discountType,
        discountAmount: discountAmt,
        validFrom: validFromDate,
        validUpto: validUptoDate,
        offerType,
        applicableTo: applicableToRef,
        offerTypeRef: offerType,
        code: code.trim().toUpperCase(),
        minPurchase: minPurch
      },
      { new: true, runValidators: true }
    );

    if (!updatedOffer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    res.status(200).json({ success: true, message: 'Offer updated successfully', redirect: '/admin/offers' });
  } catch (err) {
    console.error('Error updating offer:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `Duplicate ${field}: ${err.keyValue[field]} already exists`
      });
    }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};



const toggleOffer = async (req, res) => {
  try {
    const { id, action } = req.body;

    if (!id || !action) {
      return res.status(400).json({ success: false, message: 'Offer ID and action are required' });
    }
    if (!['list', 'unlist'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    offer.isListed = action === 'list';
    await offer.save();

    const actionText = action === 'list' ? 'listed' : 'unlisted';
    res.status(200).json({ success: true, message: `Offer ${actionText} successfully`, redirect: '/admin/offers' });
  } catch (err) {
    console.error('Error toggling offer:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
const deleteOffer = async(req,res)=>{
  try {
    const offerId = req.params.offerId;
    const offer = await Offer.findById(offerId)
    if(!offer){
      return res.status(400).json({success:false,message:'Offer not found'})
    }
    offer.isDeleted = true;
    await offer.save();
    res.status(200).json({success:true,message:'Successfully deleted'})
  } catch (error) {

     console.error('Internal server error',error)
     return res.status(400).json({success:false,message:'Internal Server error'})

    
  }
}

module.exports={
    getOffers,
     addOffer,
     editOffer,
     toggleOffer,
     deleteOffer,
}





