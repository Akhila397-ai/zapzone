const express=require('express');
const router=express.Router();
const adminController =require('../controllers/admin/adminController');
const {userAuth,adminAuth}=require('../middlewares/auth');
const customerController=require('../controllers/admin/customerController');
const categoryController=require('../controllers/admin/categoryController')
const productController=require('../controllers/admin/productController');
const brandController = require('../controllers/admin/brandController')
const orderController =require('../controllers/admin/orderController')
const couponController=require('../controllers/admin/couponController')
const offerController = require('../controllers/admin/offerController')
const {upload} = require('../helpers/multer');
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
router.patch('/editCategory/:id',adminAuth,categoryController.editCategory);
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
//brand management
router.get('/brands',adminAuth,brandController.getBrandpage);
router.post('/addBrand',adminAuth,brandController.addBrand)
router.get('/listbrand',adminAuth,brandController.getlistbrand);
router.get('/unlistbrand',adminAuth,brandController.getunlistbrand);
router.get('/editBrand',adminAuth,brandController.getEditBrand);
router.patch('/editBrand/:id', adminAuth,brandController.editBrand);
router.patch('/deleteBrand/:id',adminAuth,brandController.deleteBrand);

//order Management

router.get('/order',adminAuth,orderController.getOrders);
router.get('/viewOrder/:id',adminAuth,orderController.getOrderDetail);
router.patch('/orderStatus/:id',adminAuth,orderController.updateOrderStatus);
router.post("/orders/:id/approve-return", adminAuth,orderController.approveReturn);
router.post("/orders/:id/reject-return", adminAuth,orderController.rejectReturn);


//coupon management
router.get('/coupons',adminAuth,couponController.listCoupons);
router.post('/addCoupon',adminAuth,couponController.addCoupon);
router.patch('/editCoupon/:id',adminAuth,couponController.editCoupon);
router.get('/activateCoupon',adminAuth,couponController.activateCoupon);
router.get('/deactivateCoupon',adminAuth,couponController.deactivateCoupon);
router.patch('/deleteCoupon/:id',adminAuth,couponController.deleteCoupon);

//offer management


router.get('/offers',adminAuth, offerController.getOffers);
router.post('/addOffer',adminAuth,offerController.addOffer);
router.post('/editOffer',adminAuth, offerController.editOffer);
router.post('/toggleOffer',adminAuth, offerController.toggleOffer);
router.patch('/deleteOffer/:offerId', offerController.deleteOffer);


//sales report
router.get('/sales-report',adminAuth,adminController.getSalesReport);
router.get('/sales-report/pdf',adminAuth,adminController.downloadSalesReportPDF);
router.get('/sales-report/excel',adminAuth,adminController.downloadSalesReportExcel);

module.exports=router;