const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema")
const Product = require('../../models/productSchema')
const Brand =require('../../models/brandSchema')
const nodemailer = require('nodemailer');
const env = require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose')

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
        
        const categories = await Category.find({ isListed: true });
        const productData = await Product.find({ isBlocked: false, quantity: { $gt: 0 } })
            .sort({ createdAt: -1 })
            .limit(4);
        
        return res.render('home', {
            user: userData,
            products: productData,
            categories,
            profilePicture
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
 const signup = async(req,res)=>{
    try {
        const {name,phone,email,password,confirmPassword}=req.body
        if(password!==confirmPassword){
            return res.render("signup",{message:"password do not match"})
 }
 const findUser=await User.findOne({email});
        if(findUser){
            return res.render('signup',({message:"User with this email already exist"}));

        }
  const otp = generateotp()
  const emailSent= await sendVerificationEmail(email,otp);
  if(!emailSent){
    return res.json("email-error")
  }
    req.session.userOtp=otp;
    req.session.otpExpires = Date.now() + 60 * 1000;
    req.session.userData={name,phone,email,password};
    res.render('verify-otp');
    console.log("OTP Sent",otp);

    } catch (error) {
        console.log("sign up error",error);
        res.redirect("/pageNotFound")
        
        
    }
 }

 const securePassword = async(password)=>{
    try {
        
        const passwordHash = await bcrypt.hash(password,10);

        return passwordHash;

    } catch (error) {
        
    }
 }

 const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({ success: false, message: "OTP is required" });
        }

        if (req.session.otpExpires && Date.now() > req.session.otpExpires) {
            return res.json({success:false,message:"OTP Timout"})
        }
        if (otp == req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
            });

            await saveUserData.save();

            // Set user session
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
        const user = req.session.user;
        const userData = await User.findById(user)

        const categories = await Category.find({ isListed: true });

        const categoryIds = categories.map(cat => cat._id);

        const brand = await Brand.find({ isListed: true });
        const brandIds = brand.map(brand => brand._id);

        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

          const products = await Product.find({
            isBlocked: false,
            // quantity: { $gt: 0 }
            isDeleted:false,
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Count all available products that belong to listed categories
        const totalProducts = await Product.countDocuments({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 }
        });

        const totalPages = Math.ceil(totalProducts / limit);

        const categoriesWithIds = categories.map(category => ({
            _id: category._id,
            name: category.name
        }));
        const brandsWithIds = brand.map(brand => ({
            _id: brand._id,
            name: brand.name
        }));

        // console.log(products, 'products list');
        
        
        res.render('shop', {
            user: userData,
            products,
            category: categoriesWithIds,
            brands: brandsWithIds,
            totalProducts,
            currentPage: page,
            totalPages,
            profilePicture:userData.profilePicture
        });

    } catch (error) {
        console.log('error', error);
        res.redirect("/pageNotFound");
    }
};



const filterProduct = async (req, res) => {
    try {
        const userId = req.session.user;
        const category = req.query.cat;
        const brand =req.query.brand;
        
        const search = req.query.search?.trim();
        const sort = req.query.sort || 'newest';
        const priceRange = req.query.priceRange; 
        const page = parseInt(req.query.page) || 1;
        const itemsPerPage = 6;

        const query = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };

        let userData = null;
        if (userId) {
            userData = await User.findById(userId);
        }

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({isListed:true})

        if (category) {
            const findCategory = await Category.findById(category);
            if (!findCategory) {
                return res.status(400).render('shop', {
                    user: userData,
                    products: [],
                    category: categories,
                    totalPages: 0,
                    currentPage: page,
                    selectedCategory: null,
                    sort,
                    priceRange: priceRange || '', 
                    search: search || '',
                    req: req,
                    message: 'Invalid category selected',
                    profilePicture: userData.profilePicture || null
                });
            }
            query.category = findCategory._id;

            if (userData) {
                userData.searchHistory.push({
                    category: findCategory._id,
                    searchedOn: new Date()
                });
                await userData.save();
            }
        }
        if(brand){
            const findBrand = await Brand.findById(brand);
            if(!findBrand){
                res.status(400).render('shop',{
                    user: userData,
                    products: [],
                    category: categories,
                    totalPages: 0,
                    brands,
                    currentPage: page,
                    selectedCategory: null,
                    sort,
                    priceRange: priceRange || '', 
                    search: search || '',
                    req: req,
                    message: 'Invalid brand selected',
                    profilePicture:userData.profilePicture,
                })
            }
            query.brand = findBrand._id;
            if (userData) {
                userData.searchHistory.push({
                    brand: findBrand._id,
                    searchedOn: new Date()
                });
                await userData.save();
            }

        }

        if (search) {
            const matchingCategories = await Category.find({
                name: { $regex: search, $options: 'i' }
            }).select('_id');
            const categoryIds = matchingCategories.map(cat => cat._id);
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
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
                query.salePrice = { $gte: minPrice, $lte: maxPrice };
            }
        }

        let sortOptions = {};
        if (sort === 'price-low') {
            sortOptions = { salePrice: 1 };
        } else if (sort === 'price-high') {
            sortOptions = { salePrice: -1 };
        } else if (sort === 'a-z') {
            sortOptions = { productName: 1 };
        } else if (sort === 'z-a') {
            sortOptions = { productName: -1 };
        } else {
            sortOptions = { createdAt: -1 };
        }

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / itemsPerPage);
        const skip = (page - 1) * itemsPerPage;

        const products = await Product.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(itemsPerPage)
            .lean();

        res.render('shop', {
            user: userData,
            products: products,
            category: categories,
            totalPages,
            currentPage: page,
            selectedCategory: category || null,
            brands,
            sort,
            priceRange: priceRange || '', 
            search: search || '',
            req: req,
            profilePicture:userData.profilePicture  ||null,
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

