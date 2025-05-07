

const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema')
const Brand = require('../../models/brandSchema')
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { serializeUser } = require('passport');
const { sanitizeFilter } = require('mongoose');


const getProductAddPage = async (req, res) => {
    try {
        console.log('from getProductAddPage');
        

        const brand = await Brand.find({isListed:true});
        const category = await Category.find({ isListed:true});
        res.render('add-product', {
            cat: category,
            brand:brand,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Error in getProductAddPage:', error);
        res.redirect('/admin/pagenotfound');
    }
};


const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');




const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 4;

    
        const regexSearch = escapeRegex(search);
        const searchQuery = {
            isDeleted: false,
            // isBlocked: false,
            $or: [
                { productName: { $regex: regexSearch, $options: 'i' } },
                { 'category.name': { $regex: regexSearch, $options: 'i' } }
            ]
        };

        
        if (!search.trim()) {
            delete searchQuery.$or;
        }

        
        const productData = await Product.find(searchQuery)
            .populate('category')
            .populate('brand')
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

            console.log('productData============',productData);
            

       
        const count = await Product.countDocuments(searchQuery);

        
        const category = await Category.find({ isListed: true });

       
        console.log('Search Query:', searchQuery);
        console.log('Found Products:', productData.length);

        res.render('admin/product', {
            data: productData,
            currentPage: page,
            totalPages: Math.max(1, Math.ceil(count / limit)),
            cat: category || [],
            search: search
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.redirect('/admin/pagenotfound');
    }
};
const addProducts = async (req, res) => {
    try {
      console.log('Request Body:', req.body);
      console.log('Request Files:', req.files);
  
      const {productName,description,category,regularPrice,salePrice,quantity,brand,ram,storage, processor,color}=req.body;
      
       const regPrice = parseFloat(regularPrice);  
       const salePriceValue = parseFloat(salePrice) || 0;
       const qty = parseInt(quantity);
      
  
      const productExists = await Product.findOne({ productName });
  
      
      if (productExists) {
        return res.redirect('/admin/add-product?error=Product already exists');
      }
  
      const categoryId = await Category.findOne({ name: category });
      if (!categoryId) {
        return res.redirect('/admin/add-product?error=Invalid category');
      }
  
      const images = [];
      if (!req.files || req.files.length < 1) {
        return res.redirect('/admin/add-product?error=Please upload at least one image');
      }
  
  
     
      const permDir = path.join(__dirname, '..', '..', 'public', 'Uploads', 'product-images');
      await fs.mkdir(permDir, { recursive: true });
  
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const originalImagePath = file.path;
        const filename = `${Date.now()}-${i}${path.extname(file.originalname)}`;
        const resizedImagePath = path.join(permDir, filename);
  
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
          await fs.unlink(originalImagePath).catch(err => console.warn(`Failed to delete ${originalImagePath}: ${err}`));
          return res.redirect('/admin/add-product');
        }
  
        await sharp(originalImagePath)
          .resize({ width: 440, height: 440, fit: 'cover' })
          .toFile(resizedImagePath);
  
        await fs.unlink(originalImagePath).catch(err => console.warn(`Failed to delete temp file ${originalImagePath}: ${err}`));
  
        images.push(filename);
      }

      console.log('categoryId._id,=============',categoryId._id);
      
  
      const newProduct = new Product({
        productName,
        description,
        category: categoryId._id,
        brand: brand,
        regularPrice: regPrice,
        salePrice: salePriceValue,
        quantity: qty,
        isDeleted:false,
        productImage: images,
        createdAt: new Date(),
        status: 'Available',
        ram,
        storage,
        processor,
        color
      });
  
      await newProduct.save();
      res.redirect('/admin/products');
    } catch (error) {
      console.error('Error in addProducts:', error);
  
      if (req.files) {
        await Promise.all(
          req.files.map(file => fs.unlink(file.path).catch(err => console.warn(`Failed to delete ${file.path}: ${err}`)))
        );
      }
  
      res.redirect("/admin/add-product");
    }
  };

const blockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
        res.json({ success: true, message: "Product blocked successfully" });
    } catch (error) {
        console.error("Error blocking product:", error);
        res.status(500).json({ success: false, message: "Failed to block product" });
    }
};

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
        res.json({ success: true, message: "Product unblocked successfully" });
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.status(500).json({ success: false, message: "Failed to unblock product" });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const id = req.query.id;
      
        
        const product = await Product.findOne({ _id: id }).populate('category').populate('brand')
        const categories = await Category.find({ isListed: true });
        const brand = await Brand.find({isListed:true})

        res.render('editProduct', {
            product,
            categories,
            brand:brand,
        });
    } catch (error) {
        console.error(error);
        res.redirect('/admin/pagenotfound');
    }
};

const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const {
            productName,
            brand,
            description,
            category,
            quantity,
            salePrice,
            hasOffer,
            existingImages = [],
            removedImages = [],
            ram,
            storage,
            processor,
            color
        } = req.body;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const existingProduct = await Product.findOne({ productName, _id: { $ne: id } });
        if (existingProduct) {
            return res.status(400).json({ success: false, message: "Product with this name already exists" });
        }

        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
            return res.status(400).json({ success: false, message: "Invalid category" });
        }

        let productImages = [...existingImages];

        for (const images of removedImages) {
            const imagePath = path.join('public', 'uploads', 'product-images', images);
            try {
                await fs.unlink(imagePath);
            } catch (err) {
                console.warn(`Could not delete image ${images}:`, err);
            }
            productImages = productImages.filter(img => img !== images);
        }

        if (req.files && req.files.length > 0) {
            const newImages = req.files; 
            if (productImages.length + newImages.length > 4) {
                return res.status(400).json({ success: false, message: "Maximum 4 images allowed" });
            }

            const images = [];
            for (let i = 0; i < newImages.length; i++) {
                const originalImagePath = newImages[i].path;
                const filename = `${Date.now()}-${i}${path.extname(newImages[i].originalname)}`;
                const resizedImagePath = path.join('public', 'uploads', 'product-images', filename);

                await fs.mkdir(path.dirname(resizedImagePath), { recursive: true });
                await sharp(originalImagePath)
                    .resize({ width: 440, height: 440, fit: 'cover' })
                    .toFile(resizedImagePath);
                await fs.unlink(originalImagePath);

                images.push(filename);
            }
            productImages = [...productImages, ...images];
        }

        if (productImages.length === 0) {
            return res.status(400).json({ success: false, message: "At least one image is required" });
        }

        const salePriceNum = parseFloat(salePrice);
        const quantityNum = parseInt(quantity);

        if (isNaN(salePriceNum) || salePriceNum < 0) {
            return res.status(400).json({ success: false, message: "Invalid sale price" });
        }
        if (isNaN(quantityNum) || quantityNum < 0) {
            return res.status(400).json({ success: false, message: "Invalid quantity" });
        }

        const updateFields = {
            productName,
            brand,
            description,
            category: categoryDoc._id,
            quantity: quantityNum,
            salePrice: salePriceNum,
            hasOffer: hasOffer === 'on',
            productImage: productImages,
            ram,
            storage,
            processor,
            color,
        };

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true }
        );

        res.json({
            success: true,
            message: "Product updated successfully",
            productImage: updatedProduct.productImage
        });
    } catch (error) {
        console.error('Error in editProduct:', error);
        res.status(500).json({ success: false, message: error.message || "Failed to update product" });
    }
};
const deleteProduct = async (req, res) => {
    try {
      
        const id = req.params.id;
  
      if (!id) {
        console.log("Product ID not found");
        return res.status(400).json({ status: false, message: "Product ID is required" });
      }
  
      console.log("Received ID:", id);
  
      const product = await Product.findByIdAndUpdate(
        id,
        { $set: { isDeleted: true,isBlocked:false } },
        { new: true }
      );
  
      if (!product) {
        return res.status(404).json({ status: false, message: "Product not found" });
      }
  
      console.log("Product soft-deleted:", product._id);
      res.status(200).json({ status: true, message: "Successfully deleted" });
    } catch (error) {
      console.error("Error while deleting product:", error);
      res.status(500).json({ status: false, message: "Error while deleting the product" });
    }
  };
  

module.exports = {
    getAllProducts,
    getProductAddPage,
    addProducts,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteProduct,
};


