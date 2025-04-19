const express=require('express');
const router=express.Router();
const adminController =require('../controllers/admin/adminController');
const {userAuth,adminAuth}=require('../middlewares/auth');
const customerController=require('../controllers/admin/customerController');
const categoryController=require('../controllers/admin/categoryController')
const productController=require('../controllers/admin/productController');
const upload = require('../helpers/multer');
router.get('/pagenotfound',adminController.pagenotfound)
router.get('/login', adminController.loadLogin);  
router.post('/login', adminController.login);     
router.get('/dashboard',adminAuth, adminController.loadDashboard); 
router.get('/logout', adminController.logout); 
//customer management
router.get('/users',adminAuth,customerController.customerInfo);
router.get('/blockCustomer',adminAuth,customerController.customerBlocked);
router.get('/unblockCustomer',adminAuth,customerController.customerunBlocked);
//category management
router.get('/category',adminAuth,categoryController.categoryInfo);
router.post("/addCategory",adminAuth,categoryController.addCategory);
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get('/unlistCategory',adminAuth,categoryController.getUnlistCategory);
router.get('/editCategory',adminAuth,categoryController.getEditCategory)
router.post('/editCategory/:id',adminAuth,categoryController.editCategory);
router.patch('/deleteCategory/:id',adminAuth,categoryController.deleteCategory)
//product management
router.get('/products',adminAuth,productController.getAllProducts);
router.get('/load-add-product',adminAuth,productController.getProductAddPage);
router.post('/addProducts', adminAuth, upload.array('productImages', 4), productController.addProducts);
router.post('/block-product',adminAuth,productController.blockProduct)
router.post('/unblock-product',adminAuth,productController.unblockProduct)
router.get('/editProduct',adminAuth,productController.getEditProduct);
router.post('/editProduct/:id', adminAuth, upload.array('productImages', 4), productController.editProduct);
router.patch('/deleteProduct/:id', adminAuth, productController.deleteProduct);

module.exports=router;