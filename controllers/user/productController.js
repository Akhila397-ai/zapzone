const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Offer = require('../../models/offerSchema')
const mongoose = require('mongoose');
const findBestOffer = async (productId) => {
  try {
    const product = await Product.findById(productId).populate('category').lean();
    if (!product || !product.category) {
      return { offer: null, discountedPrice: null, discount: 0, offers: [] };
    }

    const currentDate = new Date();
    const offers = await Offer.find({
      $or: [
        { offerType: 'product', applicableTo: productId },
        { offerType: 'category', applicableTo: product.category._id }
      ],
      isListed: true,
      isDeleted: false,
      validFrom: { $lte: currentDate },
      validUpto: { $gte: currentDate }
    }).lean();

    if (!offers || offers.length === 0) {
      return { offer: null, discountedPrice: product.salePrice, discount: 0, offers: [] };
    }

    let bestOffer = null;
    let maxDiscount = 0;
    let discountedPrice = product.salePrice;

    for (const offer of offers) {
      let discount = 0;
      if (offer.discountType === 'percentage') {
        discount = (product.salePrice * Math.min(offer.discountAmount, 100)) / 100;
      } else if (offer.discountType === 'fixed') {
        discount = offer.discountAmount;
      }

      discount = Math.min(discount, product.salePrice);

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
        offerName: bestOffer.offerName,
        validUpto: bestOffer.validUpto
      } : null,
      discountedPrice: discountedPrice < 0 ? 0 : discountedPrice.toFixed(2),
      discount: maxDiscount.toFixed(2),
      offers: offers.map(offer => ({
        _id: offer._id,
        code: offer.code,
        discountType: offer.discountType,
        discountAmount: offer.discountAmount,
        offerName: offer.offerName,
        validUpto: offer.validUpto
      }))
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

    return res.render('user/product-details', {
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
      isLoggedIn: !!userId 
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