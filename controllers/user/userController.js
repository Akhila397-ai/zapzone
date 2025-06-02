const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema")
const Product = require('../../models/productSchema')
const Brand =require('../../models/brandSchema')
const nodemailer = require('nodemailer');
const env = require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Cart = require("../../models/cartSchema");
const Offer =require('../../models/offerSchema')
const Coupon = require('../../models/couponSchema')
const Wallet = require('../../models/walletSchema')
const Wishlist = require('../../models/wishlistSchema')
const { generateReferralCode } = require('../../utils/referral')


const pageNotFound = async (req,res) => {
    try {
        res.render("page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}



const loadHomePage = async (req, res) => {
  try {
    const userId = req.session.user;
    let userData = null;
    let profilePicture = null;

    if (userId) {
      userData = await User.findById(userId);
      profilePicture = userData?.profilePicture || '/img/default-profile.png';
    }

    const categories = await Category.find({ isListed: true }).lean();
    const products = await Product.find({ isBlocked: false,isDeleted:false, quantity: { $gt: 0 } })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();

    const currentDate = new Date();
    const offers = await Offer.find({
      isListed: true,
      isDeleted: false,
      validFrom: { $lte: currentDate },
      validUpto: { $gte: currentDate },
      discountType: 'percentage',
    })
      .populate('applicableTo', 'name productName')
      .lean();

    const productsWithOffers = products.map(product => {
      let offerPercentage = product.productOffer || 0;
      let offerPrice = product.salePrice;
      let appliedOffer = null;

      const productOffer = offers.find(
        offer =>
          offer.offerType === 'product' &&
          offer.applicableTo &&
          offer.applicableTo._id.toString() === product._id.toString()
      );

      const categoryOffer = offers.find(
        offer =>
          offer.offerType === 'category' &&
          offer.applicableTo &&
          product.category &&
          offer.applicableTo._id.toString() === product.category._id.toString()
      );

      if (productOffer && (!categoryOffer || productOffer.discountAmount > categoryOffer.discountAmount)) {
        offerPercentage = productOffer.discountAmount;
        appliedOffer = productOffer;
      } else if (categoryOffer) {
        offerPercentage = categoryOffer.discountAmount;
        appliedOffer = categoryOffer;
      }

      if (appliedOffer) {
        if (appliedOffer.discountType === 'percentage') {
          offerPrice = product.salePrice * (1 - offerPercentage / 100);
        } else if (appliedOffer.discountType === 'fixed') {
          offerPrice = product.salePrice - offerPercentage;
        }
        offerPrice = Math.max(0, Math.round(offerPrice));
      }

      return {
        ...product,
        offerPercentage: Math.round(offerPercentage),
        offerPrice: appliedOffer ? offerPrice : null, 
        hasOffer: !!appliedOffer,
      };
    });

    return res.render('home', {
      user: userData,
      products: productsWithOffers,
      categories,
      profilePicture: userData?.profilePicture || null,
    });
  } catch (error) {
    console.error('Error loading home page:', error);
    res.status(500).send('Server Error');
  }
};


const loadLogin = async (req, res) => {
    try {
        
      if (!req.session.user) {
        return res.render("login", { message: "" }); 
        
      } else {
        res.redirect('/');
      }
    } catch (error) {
      res.redirect("/pageNotFound");
    }
  };
  

const login = async (req,res)=>{
    try{
        const {email,password} = req.body;

        const findUser = await User.findOne({isAdmin:0,email:email});

        if(!findUser){
            return res.render("login",{message:"User not found"})
        }
        if(findUser.isBlocked){
            return res.render("login",{message:"User is blocked by admin"})
        }

        const passwordMatch = await bcrypt.compare(password,findUser.password);

        if(!passwordMatch){
            return res.render("login",{message:"Incorrect Password"})
        }

        req.session.user = {
            _id: findUser._id,
            name: findUser.name,
            email: findUser.email,
            isAdmin: findUser.isAdmin
          };
          
        res.redirect('/')
    } catch (error) {
        console.error("login error",error);
        res.render("login",{message:"login failed. Please try again later"})
    }
}

const loadSignup = async (req,res)=>{
    try{
        return res.render("signup",{message:""});
    }catch (error){
        console.log("Signup page not found",error);
        res.status(500).send("Server error")
    }
}

function generateotp(){
    return Math.floor(100000 +Math.random()*900000).toString();
}
async function sendVerificationEmail(email,otp){
    try {
        const transporter=nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            },
            tls: {
                rejectUnauthorized: false 
            }
        })
        

    const info = await transporter.sendMail({
        from:process.env.NODEMAILER_EMAIL,
        to:email,
        subject:"Verify your account",
        text:`Your OTP is ${otp}`,
        html:`<b>Your OTP:${otp}</b>`,
    }) 
    return info.accepted.length >0 
        
        
    } catch (error) {
        console.error("Error while sending email",error);
        return false; 
        
    }
}
 const signup = async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword, referralCode } = req.body;
    if (password !== confirmPassword) {
      return res.render("signup", { message: "Passwords do not match" });
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render('signup', { message: "User with this email already exists" });
    }

    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return res.render('signup', { message: 'Invalid referral code' });
      }
      if (referrer.email === email) {
        return res.render('signup', { message: 'Cannot use your own referral code' });
      }
      referredBy = referrer._id;
    }

    const otp = generateotp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.json("email-error");
    }

    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + 60 * 1000;
    req.session.userData = { name, phone, email, password, referralCode, referredBy };
    res.render('verify-otp');
    console.log("OTP Sent", otp);
  } catch (error) {
    console.log("sign up error", error);
    res.redirect("/pageNotFound");
  }
};
 const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: "OTP is required" });
    }

    if (req.session.otpExpires && Date.now() > req.session.otpExpires) {
      return res.json({ success: false, message: "OTP Timeout" });
    }

    if (otp == req.session.userOtp) {
      const { name, phone, email, password, referralCode, referredBy } = req.session.userData;

      const newReferralCode = await generateReferralCode();

      const saveUserData = new User({
        name,
        email,
        phone,
        password: await bcrypt.hash(password, 10),
        referralCode: newReferralCode,
        referredBy,
        redeemed: !!referredBy,
        wallet: referredBy ? 250 : 0 
      });

      await saveUserData.save();

      if (referredBy) {
        const walletTransaction = new Wallet({
          userId: saveUserData._id,
          type: 'CREDIT',
          amount: 250,
          reason: 'Referral signup reward',
          balanceAfter: saveUserData.wallet 
        });
        await walletTransaction.save();
      }

      // Reward referrer with ₹500 wallet credit
      if (referredBy) {
        const referrer = await User.findById(referredBy);
        if (referrer) {
          referrer.redeemedUsers.push(saveUserData._id);
          referrer.wallet = (referrer.wallet || 0) + 500; 
          await referrer.save();

          const walletTransaction = new Wallet({
            userId: referrer._id,
            type: 'CREDIT',
            amount: 500,
            reason: 'Referral reward for new user signup',
            balanceAfter: referrer.wallet 
          });
          await walletTransaction.save();
        }
      }

      req.session.user = {
        _id: saveUserData._id,
        name: saveUserData.name,
        email: saveUserData.email,
        isAdmin: saveUserData.isAdmin
      };

      req.session.userOtp = null;
      req.session.userData = null;

      return res.json({ success: true, redirectUrl: "/" });
    } else {
      return res.status(400).json({ success: false, message: "Invalid OTP, please try again" });
    }
  } catch (error) {
    console.error("Error Verifying OTP:", error);
    return res.status(500).json({ success: false, message: "An error occurred" });
  }
};

 const resendOtp = async (req,res)=>{
    try {
        
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"})
        }

        const otp = generateotp();
        req.session.userOtp = otp;
        req.session.otpExpires = Date.now() + 60 * 1000;

        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend OTP:",otp);
            res.status(200).json({success:true,message:"OTP Resend Successfully"})
        }else{
            res.status(500).json({success:false,message:"Failed to resend OTP. Please try again"});
        }

    } catch (error) {
        
        console.error("Error resending OTP",error);
        res.status(500).json({success:false,message:"Internal Server Error. Please try again"})

    }
 }

 const logout = async (req,res)=>{
    try{
        req.session.destroy((error)=>{
            if(error){
                console.log("Session destruction error",error.message);
                return res.redirect("/pageNotFound");
            }
            return res.redirect("/login")
        })
    }catch (error) {
        console.log("Logout error",error);
        res.redirect("/pageNotFound")
    }
 }


const loadShoppingPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    let userData = null;
    let cart = null;
   let wishlistProductIds = [];
    if (userId) {
      userData = await User.findById(userId).lean();
      cart = await Cart.findOne({ userId }).lean();
      const wishlist = await Wishlist.findOne({ userId }).lean();
      wishlistProductIds = wishlist ? wishlist.products.map(p => p._id.toString()) : [];
    }

    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({ isListed: true }).lean();

    

    const query = {
      isBlocked: false,
      isDeleted: false,
    };

    const products = await Product.find(query)
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const currentDate = new Date();
    const offers = await Offer.find({
      isListed: true,
      isDeleted: false,
      validFrom: { $lte: currentDate },
      validUpto: { $gte: currentDate },
    })
      .populate('applicableTo', 'name productName')
      .lean();

    const productsWithOffers = products.map((product) => {
      let offerPercentage = product.productOffer || 0;
      let offerPrice = product.salePrice;
      let appliedOffer = null;

      const productOffer = offers.find(
        (offer) =>
          offer.offerType === 'product' &&
          offer.applicableTo &&
          offer.applicableTo._id.toString() === product._id.toString()
      );

      const categoryOffer = offers.find(
        (offer) =>
          offer.offerType === 'category' &&
          offer.applicableTo &&
          product.category &&
          offer.applicableTo._id.toString() === product.category._id.toString()
      );

      if (productOffer && (!categoryOffer || productOffer.discountAmount > categoryOffer.discountAmount)) {
        offerPercentage = productOffer.discountAmount;
        appliedOffer = productOffer;
      } else if (categoryOffer) {
        offerPercentage = categoryOffer.discountAmount;
        appliedOffer = categoryOffer;
      }

      if (appliedOffer) {
        if (appliedOffer.discountType === 'percentage') {
          offerPrice = product.salePrice * (1 - offerPercentage / 100);
        } else if (appliedOffer.discountType === 'fixed') {
          offerPrice = product.salePrice - offerPercentage;
        }
        offerPrice = Math.max(0, Math.round(offerPrice));
      }

      return {
        ...product,
        offerPercentage: Math.round(offerPercentage),
        offerPrice: appliedOffer ? offerPrice : null,
        hasOffer: !!appliedOffer,
      };
    });

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    res.render('shop', {
      user: userData,
      products: productsWithOffers,
      cart,
      category: categories,
      brands,
      totalProducts,
      currentPage: page,
      totalPages,
      selectedCategory: null,
      selectedBrand: null,
      sort: 'newest',
      priceRange: '',
      search: '',
      req,
      profilePicture: userData?.profilePicture || null,
      wishlistProductIds,
    });
  } catch (error) {
    console.error('Error in loadShoppingPage:', error);
    res.status(500).render('error', { message: 'An error occurred while loading the shop page.' });
  }
};

const filterProduct = async (req, res) => {
    try {
        const userId = req.session.user?._id; 
        const { cat, brand, search, sort = 'newest', priceRange, page = 1 } = req.query;
        const itemsPerPage = 6;

        const query = {
            isBlocked: false,
            quantity: { $gt: 0 },
            isDeleted: false, 
        };

       
        let userData = null;
        let cart = null;
        let wishlistProductIds = [];
        if (userId) {
            userData = await User.findById(userId).lean();
            cart = await Cart.findOne({ userId }).lean();
            const wishlist = await Wishlist.findOne({ userId }).lean();
            wishlistProductIds = wishlist ? wishlist.products.map(p => p.productId.toString()) : [];
        }

        const categories = await Category.find({ isListed: true }).lean();
        const brands = await Brand.find({ isListed: true }).lean();

        if (cat) {
            const findCategory = await Category.findById(cat).lean();
            if (!findCategory) {
                return res.status(400).render('shop', {
                    user: userData,
                    products: [],
                    category: categories,
                    brands,
                    cart,
                    totalPages: 0,
                    currentPage: parseInt(page) || 1,
                    selectedCategory: null,
                    selectedBrand: brand || null,
                    sort: sort || 'newest',
                    priceRange: priceRange || '',
                    search: search || '',
                    req,
                    message: 'Invalid category selected',
                    profilePicture: userData?.profilePicture || null,
                    wishlistProductIds,
                    isLoggedIn: !!userId,
                });
            }
            query.category = findCategory._id;

            if (userData && userId) {
                await User.findByIdAndUpdate(userId, {
                    $push: {
                        searchHistory: {
                            category: findCategory._id,
                            searchedOn: new Date(),
                        },
                    },
                });
            }
        }

        if (brand) {
            const findBrand = await Brand.findById(brand).lean();
            if (!findBrand) {
                return res.status(400).render('shop', {
                    user: userData,
                    products: [],
                    category: categories,
                    brands,
                    cart,
                    totalPages: 0,
                    currentPage: parseInt(page) || 1,
                    selectedCategory: cat || null,
                    selectedBrand: null,
                    sort: sort || 'newest',
                    priceRange: priceRange || '',
                    search: search || '',
                    req,
                    message: 'Invalid brand selected',
                    profilePicture: userData?.profilePicture || null,
                    wishlistProductIds,
                    isLoggedIn: !!userId,
                });
            }
            query.brand = findBrand._id;

            if (userData && userId) {
                await User.findByIdAndUpdate(userId, {
                    $push: {
                        searchHistory: {
                            brand: findBrand._id,
                            searchedOn: new Date(),
                        },
                    },
                });
            }
        }

        if (search?.trim()) {
            const matchingCategories = await Category.find({
                name: { $regex: search.trim(), $options: 'i' },
            }).select('_id').lean();
            const categoryIds = matchingCategories.map(cat => cat._id);
            query.$or = [
                { productName: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } },
            ];
            if (categoryIds.length > 0) {
                query.$or.push({ category: { $in: categoryIds } });
            }
        }

        if (priceRange && priceRange !== '') {
            if (priceRange === '250000+') {
                query.salePrice = { $gte: 250000 };
            } else {
                const [minPrice, maxPrice] = priceRange.split('-').map(Number);
                if (!isNaN(minPrice) && !isNaN(maxPrice)) {
                    query.salePrice = { $gte: minPrice, $lte: maxPrice };
                }
            }
        }

        let sortOptions = {};
        switch (sort) {
            case 'price-low':
                sortOptions = { salePrice: 1 };
                break;
            case 'price-high':
                sortOptions = { salePrice: -1 };
                break;
            case 'a-z':
                sortOptions = { productName: 1 };
                break;
            case 'z-a':
                sortOptions = { productName: -1 };
                break;
            default:
                sortOptions = { createdAt: -1 };
        }

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / itemsPerPage);
        const skip = (parseInt(page) - 1) * itemsPerPage;

        let products = await Product.find(query)
            .populate('category', 'name')
            .sort(sortOptions)
            .skip(skip)
            .limit(itemsPerPage)
            .lean();

        const currentDate = new Date();
        const offers = await Offer.find({
            isListed: true,
            isDeleted: false,
            validFrom: { $lte: currentDate },
            validUpto: { $gte: currentDate },
        })
            .populate('applicableTo', 'name productName')
            .lean();

        products = products.map((product) => {
            let offerPercentage = product.productOffer || 0;
            let offerPrice = product.salePrice;
            let appliedOffer = null;

            const productOffer = offers.find(
                (offer) =>
                    offer.offerType === 'product' &&
                    offer.applicableTo &&
                    offer.applicableTo._id.toString() === product._id.toString()
            );

            const categoryOffer = offers.find(
                (offer) =>
                    offer.offerType === 'category' &&
                    offer.applicableTo &&
                    product.category &&
                    offer.applicableTo._id.toString() === product.category._id.toString()
            );

            if (productOffer && (!categoryOffer || productOffer.discountAmount > categoryOffer.discountAmount)) {
                offerPercentage = productOffer.discountAmount;
                appliedOffer = productOffer;
            } else if (categoryOffer) {
                offerPercentage = categoryOffer.discountAmount;
                appliedOffer = categoryOffer;
            }

            if (appliedOffer) {
                if (appliedOffer.discountType === 'percentage') {
                    offerPrice = product.salePrice * (1 - offerPercentage / 100);
                } else if (appliedOffer.discountType === 'fixed') {
                    offerPrice = product.salePrice - offerPercentage;
                }
                offerPrice = Math.max(0, Math.round(offerPrice));
            }

            return {
                ...product,
                offerPercentage: Math.round(offerPercentage),
                offerPrice: appliedOffer ? offerPrice : null,
                hasOffer: !!appliedOffer,
            };
        });

        res.render('shop', {
            user: userData,
            products,
            category: categories,
            brands,
            cart,
            totalProducts,
            totalPages,
            currentPage: parseInt(page) || 1,
            selectedCategory: cat || null,
            selectedBrand: brand || null,
            sort: sort || 'newest',
            priceRange: priceRange || '',
            search: search || '',
            req,
            profilePicture: userData?.profilePicture || null,
            wishlistProductIds, 
            isLoggedIn: !!userId,
        });
    } catch (error) {
        console.error('Error in filterProduct:', error);
        res.status(500).render('error', { message: 'An error occurred while filtering products.' });
    }
};
module.exports = {
    loadHomePage,
    pageNotFound,
    loadLogin,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    login,
    logout,
    loadShoppingPage,
    filterProduct,
}

