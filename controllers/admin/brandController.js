const { error } = require('console');
const Brand = require('../../models/brandSchema')
const Product = require('../../models/productSchema')
const path=require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');


const getBrandpage=async(req,res)=>{
    try {
           const page = parseInt(req.query.page) || 1;  
           const limit = parseInt(req.query.limit) || 4;  
           const skip = (page - 1) * limit;
           const search = req.query.search || "";
   
          
           const brandData = await Brand.find({
               name: { $regex: ".*" + search + ".*", $options: "i" }
           })
               .sort({ createdOn: -1 })
               .skip(skip)
               .limit(limit);
   
           
           const totalBrands = await Brand.countDocuments({
               name: { $regex: ".*" + search + ".*", $options: "i" }
           });
           const totalPages = Math.ceil(totalBrands / limit);
           
           res.render('brands', {
               brands: brandData,
               currentPage : page,
               totalPages: totalPages,
               totalBrands: totalBrands,
               searchQuery: search 
           });        
       } catch (error) {
           console.error("Error in categoryInfo:", error);
           return res.status(500).render("error", { message: "Something went wrong while fetching categories." });
       }
   };
   const addBrand = async(req,res)=>{
    try {
        const {name,description} = req.body;
        if(!name || !description){
            return res.status(400).json({error:"All fields required"})
        }
        const existingBrand = await Brand.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if(existingBrand){
            return res.status(400).json({success:false,message:"This brand already exists"});
        }
        const newBrand = new Brand({name,description});
        await newBrand.save();
        return res.status(200).json({success:true,message:"Brand assed successfully"});

    } catch (error) {
        console.log("Error while adding the category");
        return res.status(500).json({success:false,message:"Internal error occured"});
        
        
    }
   }
const getlistbrand=async(req,res)=>{
    try {
        let id=req.query.id;

        const result = await Brand.updateOne({_id:id},{$set:{isListed:true}});
        console.log("brand listed successfully",result);
        res.redirect('/admin/brands');
        

    } catch (error) {
        console.log("error while listing the brand",error);
        res.redirect('/pageNotFound')
        
        
    }
}
const getunlistbrand=async(req,res)=>{
    try {
        let id=req.query.id;
        console.log("id recieved",id);
        const result=await Brand.updateOne({_id:id},{$set:{isListed:false}})
        if(result.matchedCount ===0){
            console.log("Category not found in database!");
            return res.redirect('/pagenotfound');
        }
        console.log("category unlisted successfully");
        res.redirect('/admin/brands');
        


        
    } catch (error) {
        console.log("error while unlisting");
        return res.redirect('/pagenotfound');
        
        
    }
}
const getEditBrand=async(req,res)=>{
    try {
        const id = req.query.id;
         if(!id){
            console.log("No id found",error);
            res.redirect('/pageNotFound');
            
         }
         const brand = await Brand.findOne({_id:id});
         if(!brand){
            console.log("brand not found",error);
            
         }else{
            res.render('edit-brand',{brand})
         }
    } catch (error) {
        console.log("internal error while rendering the page");
        res.redirect('/pageNotFound');
        
        
    }
}

const editBrand = async(req,res)=>{

        try {
          const { id } = req.params;
          const { brandName, brandDescription } = req.body;
      
    
          if (!brandName || !brandDescription) {
            return res.status(400).json({ success: false, error: 'Brand name and description are required' });
          }
      //find the bran
          const brand = await Brand.findById(id);
          if (!brand) {
            return res.status(404).json({ success: false, error: 'Brand not found' });
          }
      
      
          const updatedBrand = await Brand.findByIdAndUpdate(
            id,
            { $set: { name: brandName, description: brandDescription } },
            { new: true, runValidators: true }
          );
      
          console.log('Updated brand:', updatedBrand);
      
          return res.status(200).json({
            success: true,
            message: 'Brand updated successfully',
            data: updatedBrand,
          });
        } catch (error) {
          console.error('Error updating brand:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    
}
const deleteBrand= async(req,res)=>{
    try {
        const id = req.params.id;
        if(!id){
            console.log("ID not found");
            return;
            
        }
        console.log("id recieved",id);
        const brand= await Brand.findByIdAndUpdate(
            id,
            {$set:{isDeleted:true}},
            {new:true},
        )
        if(!brand){
            return res.status(400).json({message:"cant find the brand"});
        }
        console.log("successfully softDeleted");
        return res.status(200).json({success:true,message:"successfully deleted"});

        
        

    } catch (error) {
        console.log("internal error");
        return res.status(400).json({message:"internal error"});
        
        
    }
}
   
   module.exports={
    getBrandpage,
    addBrand,
    getlistbrand,
    getunlistbrand,
    getEditBrand,
    editBrand,
    deleteBrand,

   }
   