
const Category = require('../../models/categorySchema');
const Product=require('../../models/productSchema')
const categoryInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;  
        const limit = parseInt(req.query.limit) || 4;  
        const skip = (page - 1) * limit;
        const search = req.query.search || "";

       
        const categoryData = await Category.find({
            name: { $regex: ".*" + search + ".*", $options: "i" }
        })
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        
        const totalCategories = await Category.countDocuments({
            name: { $regex: ".*" + search + ".*", $options: "i" }
        });
        const totalPages = Math.ceil(totalCategories / limit);
        
        res.render('category', {
            cat: categoryData,
            currentPage : page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            searchQuery: search 
        });        
    } catch (error) {
        console.error("Error in categoryInfo:", error);
        return res.status(500).render("error", { message: "Something went wrong while fetching categories." });
    }
};

const addCategory = async (req, res) => {
    const { name, description } = req.body;
    try {
        if (!name || !description) {
            return res.status(400).json({ success:false, message: "All fields are required" });
        }

        const existingCategory = await Category.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (existingCategory) {
            return res.status(400).json({ success:false, message: "Category already exists" });
        }

        const newCategory = new Category({ name, description });
        await newCategory.save();

        return res.status(201).json({ success:true, message: "Category added successfully" });
    } catch (error) {
        console.error("Error in addCategory:", error);
        return res.status(500).json({ success:false, message: "Internal server error" });
    }
}



const getListCategory = async (req, res) => {
    try {
        let id = req.query.id;
        console.log("Received ID:", id); 

        const result = await Category.updateOne({ _id: id }, { $set: { isListed: true } });
        console.log("Update Result:", result); 

        res.redirect('/admin/category');
    } catch (error) {
        console.error("Error updating category:", error);  
        res.redirect('/pagenotfound');
    }
};

const getUnlistCategory = async (req, res) => {
    try {
        let id = req.query.id;
        console.log("Received ID for unlisting:", id); 

        const result = await Category.updateOne({ _id: id }, { $set: { isListed: false } });

        if (result.matchedCount === 0) {
            console.log("Category not found in database!");
            return res.redirect('/pagenotfound');
        }

        console.log("Category successfully unlisted!");
        res.redirect('/admin/category');

    } catch (error) {
        console.error("Error in getUnlistCategory:", error);
        res.redirect('/pagenotfound');
    }
};

const getEditCategory = async (req, res) => {
    try {
        const id = req.query.id;
        if (!id) {
            console.log(" No ID provided in request");
            return res.redirect('/pagenotfound');
        }

        const category = await Category.findOne({ _id: id });

        if (!category) {
            console.log(" No category found for ID:", id);
            return res.redirect('/pagenotfound');
        }

        console.log("Category found:", category);
        res.render('edit-category', { category });

    } catch (error) {
        console.error("Error in getEditCategory:", error);
        res.redirect('/pagenotfound');
    }
};

const editCategory = async(req,res)=>{
   try {
    const id=req.params.id;
    const {categoryName,categoryDescription}=req.body;
    const existingCategory=await Category.findOne({name:categoryName})
   console.log(categoryName);
   console.log(categoryDescription);
   
   
    if(existingCategory){
        return res.status(400).json({error:"Category already exsts,please choose another one"})

    }
  
    
    const updateCategory = await Category.findOneAndUpdate(
        {_id:id},
        {$set:{name:categoryName,description:categoryDescription}},
        {new:true}
    );
    console.log(updateCategory);
    
    if(updateCategory){
        return res.status(200).json({success:true,message:"Updated"})
    }else{
        res.status(404).json({error:"Category not found"})
    }
   } catch (error) {
        res.status(500).json({error:"internal error"})
   }
}
const deleteCategory = async (req, res) => {
    try {
      const id = req.params.id;

      if(!id){
        console.log("id not found");
        return;
      }

      console.log("Received ID:", id);
  
      const category = await Category.findByIdAndUpdate(
        id ,
        { $set: { isDeleted: true } },
        { new: true } 
      );

       
  
      if (!category) {
        return res.status(404).json({ status: false, message: "Category not found" });
      }
  
      console.log("Category soft-deleted:", category._id);
      res.status(200).json({ status: true, message: "Successfully deleted" });
  
    } catch (error) {
      console.error("Error while deleting category:", error);
      res.status(500).json({ status: false, message: "Error while deleting the category" });
    }
  };
   
        
    
module.exports = {
    categoryInfo,
    addCategory,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
    deleteCategory,
};
