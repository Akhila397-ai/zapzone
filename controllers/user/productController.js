const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');

const productDetails = async (req, res) => {
    try {
        // Extract query parameters
        const userId = req.session.user;
        const productId = req.query.id;
        const page = parseInt(req.query.page) || 1; // Pagination page
        const search = req.query.search || ''; // Optional search for related products
        const limit = 4; // Number of related products per page

        // Fetch user data
        const userData = userId ? await User.findById(userId) : null;

        // Fetch the main product
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const findCategory = product.category;

        // Build query for related products
        let relatedQuery = {
            // category: findCategory._id,
            _id: { $ne: productId } // Exclude the current product
        };

        // Add search filter if provided
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
            searchQuery: search
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).send('Server Error');
    }
};

module.exports = {
    productDetails,
};