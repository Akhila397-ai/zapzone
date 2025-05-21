const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Offer = require('../../models/offerSchema')
const mongoose = require('mongoose');

const findBestOffer = async (productId) => {
  try {
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return { offer: null, discountedPrice: product.salePrice, discount: 0, offers: [] };
    }

    const currentDate = new Date();
    const offers = await Offer.find({
      isListed: true,
      isDeleted: false,
      validFrom: { $lte: currentDate },
      validUpto: { $gte: currentDate },
      $or: [
        { offerType: 'Product', applicableTo: productId },
        { offerType: 'Category', applicableTo: product.category._id },
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

      if (discount > maxDiscount && product.salePrice >= offer.minPurchase) {
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
        minPurchase: bestOffer.minPurchase,
        offerName: bestOffer.offerName, 
      } : null,
      discountedPrice: discountedPrice < 0 ? 0 : discountedPrice,
      discount: maxDiscount,
      offers: offers.map(offer => ({
        _id: offer._id,
        code: offer.code,
        discountType: offer.discountType,
        discountAmount: offer.discountAmount,
        minPurchase: offer.minPurchase,
        offerName: offer.offerName, 
      })),
    };
  } catch (error) {
    console.error('Error finding best offer:', error);
    return { offer: null, discountedPrice: null, discount: 0, offers: [] };
  }
};

const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.query.id;
    const search = req.query.search;
    const page = parseInt(req.query.page) || 1;
    const limit = 4;

    const userData = userId ? await User.findById(userId) : null;
    const product = await Product.findById(productId).populate('category').populate('brand');

    if (!product || product.isBlocked || product.isDeleted) {
      return res.status(404).send('Product not found');
    }

    const findCategory = product.category;

    let relatedQuery = {
      category: findCategory._id,
      _id: { $ne: productId },
      isBlocked: false,
      isDeleted: false,
    };

    if (search) {
      relatedQuery.productName = { $regex: '.*' + search + '.*', $options: 'i' };
    }

    const relatedProducts = await Product.find(relatedQuery)
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const totalRelatedProducts = await Product.countDocuments(relatedQuery);
    const totalPages = Math.ceil(totalRelatedProducts / limit);

    const { offer, discountedPrice, discount, offers } = await findBestOffer(productId);

    return res.render('product-details', {
      product,
      userData,
      findCategory,
      relatedProducts,
      currentPage: page,
      totalPages,
      bestOffer: offer,
      offers, 
      discountedPrice,
      discount,
      searchQuery: search || '',
      profilePicture: userData?.profilePicture || null,
    });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).send('Server Error');
  }
};

module.exports = {
    productDetails,
    findBestOffer,
};