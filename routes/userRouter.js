const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const productController = require('../controllers/user/productController');
const profileController = require('../controllers/user/profileController')
const cartController = require('../controllers/user/cartController')
const checkoutContoller = require('../controllers/user/checkoutController')
const wishlistController= require('../controllers/user/wishlistController')
const passport = require("passport");
const { uploadProfilePicture } = require('../helpers/multer');

const { userAuth } = require("../middlewares/auth");



router.get("/pageNotFound",userController.pageNotFound);


//user management
router.get("/signup",userController.loadSignup);
router.post("/signup",userController.signup);
router.post("/verify-otp",userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp);
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/signup" }),
  (req, res) => {
    req.session.user = req.user; 
    res.redirect("/");
  }
);
router.get("/login",userController.loadLogin);
router.post('/login',userController.login)
router.get('/',userAuth,userController.loadHomePage);
router.get('/shop',userAuth,userController.loadShoppingPage);
router.get('/filter',userAuth,userController.filterProduct);
router.get("/logout",userController.logout);

//product management
router.get('/productDetails',userAuth,productController.productDetails);
//profile management
router.get('/forgot-password',profileController.getForgotPassword);
router.post('/forgot-email-valid',profileController.forgotEmailValid);
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp)
router.get('/reset-password',profileController.getResetPassPage);
router.post('/resend-forgot-otp',profileController.resendOtp);
router.post('/reset-password',profileController.postNewPassword);
router.get('/profile',userAuth,profileController.userProfile);
router.get('/getEditProfile',userAuth,profileController.getEditProfile)
router.post('/updateProfile', uploadProfilePicture.single('profilePicture'), profileController.updateProfile);
router.get('/change-password',userAuth,profileController.changePassword)
router.post('/change-password',userAuth,profileController.changePasswordValid);
router.post('/verify-changepassword-otp',userAuth,profileController.verifyChangePassOtp);
router.get('/change-email',userAuth,profileController.changeEmail)
router.post('/change-email',userAuth,profileController.changeEmailValid)
router.post('/verify-email-otp',userAuth,profileController.verifyEmailOtp)
router.post('/update-email',userAuth,profileController.updateEmail)
router.patch('/remove-profile-photo',userAuth, profileController.removeProfilePhoto);


//address management
router.get('/addresses',userAuth,profileController.userAddress);
router.get('/add-address',userAuth,profileController.addAddress);
router.post('/add-address',userAuth,profileController.postAddAddress);
router.get('/edit-address',userAuth,profileController.editAddress);
router.post('/update-address',userAuth,profileController.postEditAddress);
router.patch('/delete-address',userAuth,profileController.deleteAddress);
router.patch('/set-default-address',userAuth,profileController.setDefaultAddress);
//cart management
router.get('/cart',userAuth,cartController.loadCart);
router.post('/addToCart',userAuth,cartController.addToCart);
router.put('/update-cart',userAuth,cartController.updateCart);
router.patch('/removeFromCart/:productId', userAuth,cartController.removeFromCart);


//Checkout management
router.get('/checkout',userAuth,checkoutContoller.getCheckoutPage);
router.post('/place-order',userAuth,checkoutContoller.placeOrder);
router.get('/order-success',userAuth,checkoutContoller.loadOrderSuccessPage)
router.get('/orders', userAuth,checkoutContoller.loadOrders);
router.get('/orderdetails',userAuth,checkoutContoller.loadOrderDetails)
router.post('/cancelOrder',userAuth,checkoutContoller.cancelOrder);
router.post('/cancel-product', userAuth,checkoutContoller.cancelProduct);
router.post('/request-return',userAuth,checkoutContoller.requestReturn);
router.get('/coupons/available',userAuth,checkoutContoller.getAvailableCoupons);
router.post('/apply-coupon',userAuth,checkoutContoller.applyCoupon);
router.post('/remove-coupon',userAuth,checkoutContoller.removeCoupon);
router.post('/create-razorpay-order',checkoutContoller.createRazorpayOrder);
router.post('/verify-razorpay-payment',checkoutContoller.verifyRazorpayPayment);
router.get('/payment-failure', userAuth,checkoutContoller.loadPaymentFailurePage);
router.get('/retry-payment', userAuth, checkoutContoller.retryPayment);





//wallet management
router.get('/wallet',userAuth,checkoutContoller.loadWallet)

//wishlist management
router.get('/wishlist',userAuth,wishlistController.loadWishlist);
router.post('/addToWishlist',userAuth,wishlistController.addToWishlist);
router.patch('/remove-from-wishlist',userAuth,wishlistController.removeFromWishlist)

const removeCoupon = async (req, res) => {
  try {
    const { userId } = req.body;
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }
    cart.discount = 0;
    cart.coupon = { code: "", discount: 0 };
    cart.total = cart.subtotal + cart.shipping;
    await cart.save();
    res.status(200).json({ success: true, message: "Coupon removed successfully" });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = router