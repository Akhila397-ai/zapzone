const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');

const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
    
        const productId = req.query.id;
        const search =req.query.search;
        const page = parseInt(req.query.page);
        const limit=4;

        const userData = userId ? await User.findById(userId) : null;

        const product = await Product.findById(productId).populate('category').populate('brand');

        
        if (!product ||  product.isBlocked) {
            return res.status(404).send('Product not found');
        }

        const findCategory = product.category;

        let relatedQuery = {
            category: findCategory._id, 
            _id: { $ne: productId }
        

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
        res.render('product-details', {
            product,
            userData,
            findCategory,
            relatedProducts,
            currentPage: page,
            totalPages,
            searchQuery: search,
            profilePicture: userData.profilePicture || null
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).send('Server Error');
    }
};


module.exports = {
    productDetails,
};