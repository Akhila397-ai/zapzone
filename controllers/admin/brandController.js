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
            return res.status(400).json({error:"This brand already exists"});
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
        const id=req.params.id;
        const {brandName,brandDescription}=req.body;
        const existingBrand=await Brand.findOne({name:brandName});
        console.log(existingBrand);

        if(existingBrand){
            return res.status(200).json({error:"This brand already exists"});
        }
        const updateBrand = await Brand.findByIdAndUpdate(
            {_id:id},
            {$set:{name:brandName,description:brandDescription}},
            {new:true}
        );
        console.log(updateBrand);

        if(updateBrand){
            return res.status(200).json({success:true,message:"updated successfully"});
        }else{
            return res.status(400).json({error:"category not found"});
        }
        

        
           

    } catch (error) {
        console.log(error);
        return res.status(400).json({error:"internal error"});
        
        
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
   