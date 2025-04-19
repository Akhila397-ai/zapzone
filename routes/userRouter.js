
const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const productController = require('../controllers/user/productController');
const passport = require("passport");
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


module.exports = router