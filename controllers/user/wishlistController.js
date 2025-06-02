const User =require('../../models/userSchema');
const Product =require('../../models/productSchema');
const Category =require('../../models/categorySchema');
const Cart =require('../../models/cartSchema');
const Wishlist =require('../../models/wishlistSchema')
const mongoose = require('mongoose');


const loadWishlist = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            console.log('User not authenticated');
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
        console.log('User ID:', userId);

        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found');
            return res.render('pageNotFound', { error: 'User not found' });
        }

        const wishlist = await Wishlist.findOne({ userId }).populate({
            path: 'products.productId',
            populate: { path: 'category' }
        });
        console.log('Wishlist:', wishlist);

        let products = [];
        if (wishlist && wishlist.products.length > 0) {
            products = wishlist.products
                .filter(item => item.productId)
                .map(item => item.productId);
        }
        console.log('Products:', products);

        res.render('wishlist', {
            user,
            products,
            profilePicture: user.profilePicture || null,
            csrfToken: req.csrfToken ? req.csrfToken() : null
        });
    } catch (error) {
        console.error('Error in loadWishlist:', error);
        res.render('pageNotFound', { error: 'Something went wrong. Please try again.' });
    }
};
const addToWishlist = async (req, res) => {
    try {
        console.log('Request Body:', req.body);
        console.log('Session:', req.session);

        if (!req.session.user || !req.session.user._id) {
            console.log('User not authenticated');
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const userId = req.session.user._id;
        const productId = req.body.productId;

        console.log('UserId:', userId);
        console.log('ProductId:', productId);

        if (!productId) {
            console.log('Product ID missing');
            return res.status(400).json({ success: false, message: 'Product ID is required' });
        }
        if (!mongoose.isValidObjectId(productId)) {
            console.log('Invalid Product ID');
            return res.status(400).json({ success: false, message: 'Invalid Product ID' });
        }

        let wishlist = await Wishlist.findOne({ userId });

        if (wishlist) {
            const alreadyInWishlist = wishlist.products.some(
                (item) => item.productId.toString() === productId
            );
            if (alreadyInWishlist) {
                console.log('Product already in wishlist');
                return res.json({ success: false, message: 'Product already in wishlist' });
            }

            wishlist.products.push({ productId });
            await wishlist.save();
            console.log('Product added to existing wishlist');
        } else {
            await Wishlist.create({
                userId,
                products: [{ productId }],
            });
            console.log('New wishlist created');
        }

        return res.json({ success: true, message: 'Product added to wishlist' });
    } catch (err) {
        console.error('Error in addToWishlist:', err);
         return res.status(500).json({ success: false, message: 'Server error' });
    }
};
const removeFromWishlist = async (req, res) => {
    try {
        console.log("============================================================",req.body);
        const {productId} = req.body

        const userId = req.session.user

        if (!userId || !productId) {
            return res.status(400).json({ success: false, message: 'Missing user or product ID' });
        }

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const userData = await User.findById(userId)
        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
       

      const wishlist =  await Wishlist.updateOne(
  { userId },
  { $pull: { products: { productId: productId } } },
  {new:true}
);

      if(wishlist){
         return res.status(200).json({ success: true, message: 'Item removed from wishlist' });
      }else{
         return res.status(400).json({ success: false, message: 'Item removed failed'});

      }
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
const checkWishlistStatus = async (req, res) => {
  try {
    const { productIds } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.json({
        success: true,
        wishlist: productIds.map(productId => ({
          productId,
          inWishlist: false,
        })),
      });
    }

    if (!Array.isArray(productIds) || productIds.some(id => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: 'Invalid product IDs' });
    }

    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistProductIds = wishlist ? wishlist.products.map(p => p.productId.toString()) : [];

    const response = productIds.map(productId => ({
      productId,
      inWishlist: wishlistProductIds.includes(productId),
    }));

    res.json({ success: true, wishlist: response });
  } catch (error) {
    console.error('Error in checkWishlistStatus:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports={
    loadWishlist,
    addToWishlist,
    removeFromWishlist,
    checkWishlistStatus,
}