
const User = require('../../models/userSchema');

const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || ""; 
        let page = parseInt(req.query.page) || 1; 
        const limit = 10; 

        
        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } }
            ],
        })
        .sort({createdOn:-1})
        .limit(limit)
        .skip((page - 1) * limit)
        .exec();
       
        

        
        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } }
            ],
        });

        
        res.render('admin/customers', {
            users: userData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            searchQuery: search,
        });

    } catch (error) {
        console.error("Error fetching customer info:", error);
        res.status(500).send("Internal Server Error");
    }
};
const customerBlocked=async(req,res)=>{
    try {
        let id=req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect('/admin/users')
    } catch (error) {
        res.redirect('/pagenotfound')
        
    }
};

const customerunBlocked = async(req,res) =>{
    try {
        let id=req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect('/admin/users')
    } catch (error) {
        res.redirect('/pagenotfound')
        
    }
    
}


module.exports = { customerInfo,customerBlocked,customerunBlocked };
