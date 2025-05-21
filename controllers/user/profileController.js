const User =require('../../models/userSchema')
const Address = require('../../models/addressSchema')
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();
const session = require('express-session')
const path = require('path');
const fs = require('fs').promises;
const fsp = require('fs/promises');
const mongoose = require('mongoose');
const { log } = require('console');





 

function generateOtp(){
    const digits='1234567890';
    let otp="";
    for(let i=0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*digits.length)];
    }
    return otp;

}
const sendVerificationEmail = async(email,otp)=>{
    try {
        const transporter = nodemailer.createTransport({
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
        const mailOptions ={
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Your otp for password reset",
            text:`your otp is ${otp}`,
            html:`<b><h4>Your otp is ${otp}</h4><b>`

        }

        const info = await transporter.sendMail(mailOptions);
        console.log('Email send:',info.messageId);
        return true;
        
    } catch (error) {
        console.error('Error while sending email',error)
        return false;        
    }
}
const securePassword = async(password)=>{
    try {
        const passwordHash =await bcrypt.hash(password,10);
        return passwordHash;
    } catch (error) {
        
    }
}

const getForgotPassword =async(req,res)=>{
    try {
        res.render('forgot-password')
    } catch (error) {
        res.redirect('/pageNotFound')
        
    }
}
const forgotEmailValid = async(req,res)=>{
    try {
        const {email}=req.body;
        const findUser = await User.findOne({ email: email });
        if (findUser) {
             const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp)
            if(emailSent){
                req.session.userotp =otp;
                req.session.otpExpires = Date.now() + 30 * 1000;
                req.session.email = email;
                res.render('forgotPass-otp');
                console.log("OTP",otp);
                
            }else{
                res.json({success:false,message:"Failed to send otp,Please try again"});


            }
        }else{
            res.render('forgot-password',{
                message:"User with this Email does not exists"
            });
    

        }
    } catch (error) {
        res.redirect('/pageNotFound');
       
        
    }
}
const verifyForgotPassOtp = async(req,res)=>{
    try {
        const enteredOtp=req.body.otp;
        
        if (req.session.otpExpires && Date.now() > req.session.otpExpires) {
            return res.json({success:false,message:"OTP Timout"})
        }

        if(enteredOtp === req.session.userotp){
        res.json({success:true,redirectUrl:'/reset-password'});
        }else{
            res.json({success:false,message:"OTP is not matching"})
        }

    } catch (error) {
        res.status(500).json({success:false,message:"internal error,please try again"})

    
        
    }
}
const getResetPassPage = async(req,res)=>{
    try {
        res.render('reset-password');
    } catch (error) {
        res.redirect('/pageNotFound');
        
    }
}
const resendOtp = async (req,res)=>{
    try {
        
        console.log(req.session.email)
        const email = req.session.email;
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"})
        }

        const otp = generateOtp();
        req.session.userotp = otp;
        req.session.otpExpires = Date.now() + 30 * 1000;

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
 const postNewPassword = async(req,res)=>{
    try {
        const {newPass1,newPass2}=req.body;
        const email = req.session.email;
        if(newPass1==newPass2){
            const passwordHash= await securePassword(newPass1);
            await User.updateOne(
                {email:email},
                {$set:{password:passwordHash}},


            )
            res.redirect('/login');
        }else{
            res.render('reset-password',{message:"Password Do Not Match"})
        }
    } catch (error) {
        res.redirect('/pageNotFound');
        
    }
 }
 const userProfile = async(req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).select('name gender email phone profilePicture');
        const addressData = await Address.findOne({userId : userId})
        console.log('User Data:', userData);

        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.render('profile', {
            user:userData,userAddress:addressData,
            name: userData.name,
             email: userData.email,
            phone: userData.phone,
            profilePicture: userData.profilePicture || null
        });
       
    } catch (error) {
        console.error('Error while retrieving user profile data:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

 const getEditProfile = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).select('name gender email phone');
        
        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
       

        res.render('edit-profile', {
            name: userData.name,
            gender: userData.gender,
            email: userData.email,
            phone: userData.phone,
            profilePicture: userData.profilePicture || null
        });
    } catch (error) {
        console.error('Error while retrieving user data for edit:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const { name, phone } = req.body;
        const updateData = { name,phone };

        let oldProfilePicture = null;
        if (req.file) {
            // Get the current user's profile picture to delete later
            const user = await User.findById(userId).select('profilePicture');
            oldProfilePicture = user.profilePicture;

            const tempPath = req.file.path;
            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            const permanentPath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'profile-pictures', fileName);

            await fs.mkdir(path.dirname(permanentPath), { recursive: true });
            await fs.rename(tempPath, permanentPath);

            updateData.profilePicture = `/Uploads/profile-pictures/${fileName}`;
        }

        const user = await User.findByIdAndUpdate(userId, updateData, { new: true });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
       
        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            profilePicture: user.profilePicture
        };
        

      
        if (oldProfilePicture && req.file) {
            const oldPicturePath = path.join(__dirname, '..', '..', 'public', oldProfilePicture);
            try {
                await fs.unlink(oldPicturePath);
            } catch (err) {
                console.warn(`Failed to delete old profile picture: ${oldPicturePath}`, err);
            }
        }

        res.redirect('/profile');
    } catch (error) {
        console.error('Error while updating user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
const changePassword = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).select('profilePicture');

        res.render('change-password',{
            profilePicture: userData?.profilePicture || null
        
        });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}
const changePasswordValid= async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).select('profilePicture');
        const {email}= req.body;

        const userExists = await User.findOne({email});
        if(userExists){
           const otp = generateOtp()
           req.session.userotp=otp;
           console.log('dhfvbij',req.session.userotp);
           
           const emailSent = await sendVerificationEmail(email,otp)
           if(emailSent){
            req.session.userData =req.body;
            req.session.email = email;
            res.render('change-password-otp',{
                profilePicture: userData?.profilePicture || null
            });
            console.log('OTP is:',otp);
            
           }else{
            res.json({
                success:false,
                message:"Failed to send otp,please try again"
            })
           }
        }else{
            res.render('change-password',{
                message:"User wuth this Email does not exists"
            })
        }
    } catch (error) {
        console.log('Error in changing the password validation',Error);
        res.redirect('/pageNotFound');
        

        
    }
}

const verifyChangePassOtp = async(req,res)=>{
    try {
        const enteredOtp =req.body.otp;
        console.log('session otp:',req.session.userotp);
        
        if(enteredOtp===req.session.userotp){
            res.json({success:true,redirectUrl:'/reset-password'})
        }else{
            res.json({success:false,message:"OTP not matching"});
        }
        
    } catch (error) {
        res.status(500).json({success:false,message:"An error occured,please try again later"})
        
    }
}
const changeEmail = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).select('profilePicture');

        res.render('change-email', {
            profilePicture: userData?.profilePicture || null
        });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const changeEmailValid = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).select('profilePicture');
        const {email}= req.body;
        const userExists = await User.findOne({email});
        if(userExists){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userotp =otp;
                req.session.userData = req.body;
                req.session.email=email;
                res.render('change-email-otp',{
                    profilePicture: userData?.profilePicture || null
                });
                console.log('OTP:',otp);
                
            }else{
                res.json('email-error')
            }
        }else{
            res.render('change-email',{
                message:"User with this email already exists"
            })
        }
    } catch (error) {
        res.redirect('pageNotFound')

        
    }
}
const verifyEmailOtp = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).select('profilePicture');
        const enteredOtp= req.body.otp;
        if(enteredOtp===req.session.userotp){
            req.session.userData=req.body.userData;
            res.render('new-email',{
                userData:req.session.userData,
                profilePicture: userData?.profilePicture || null

            })
        }else{
            res.render('change-email-otp',{
                message:"OTP is not matching",
                profilePicture: userData?.profilePicture || null
            })
        }
    } catch (error) {
        res.redirect('/pageNotFound');
        
    }
}
const updateEmail = async(req,res)=>{
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail})
        res.redirect('/profile')
    } catch (error) {
        res.redirect('/pageNotFound');
        
    }
}
const userAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const addressDocs = await Address.find({ userId });

        const addresses = addressDocs.flatMap(doc => doc.address);

        res.render('addresses', {
            active: 'addresses',
            profilePicture: userData.profilePicture,
            addresses 
        });
    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound');
    }
};

const addAddress = async(req,res)=>{
    try {

        const userId = req.session.user;
        
        const userData = await User.findById(userId);

        res.render('add-address',{
            user:userId,
            active: 'addresses',
            profilePicture: userData.profilePicture,


        })
    } catch (error) {
        console.log("hsdbj",error);
        
        res.redirect('/pageNotFound');
        
    }
}
const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect('/login');

        const userData = await User.findById(userId);
        if (!userData) return res.redirect('/login');

        const {
            addressType, name, city, landMark, state,
            pincode, phone, altPhone, isDefault
        } = req.body;

        if (!addressType || !name || !city || !landMark || !state || !pincode || !phone || !altPhone) {
            return res.status(400).json({ success: false, message: "Missing required address fields" });
        }

        const userAddress = await Address.findOne({ userId });

        const newAddress = {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode,
            phone,
            altPhone,
            isDefault: isDefault === 'true'
        };

        if (!userAddress) {
            const addressDoc = new Address({
                userId,
                address: [newAddress]
            });
            await addressDoc.save();
        } else {
            if (newAddress.isDefault) {
                userAddress.address.forEach(addr => addr.isDefault = false);
            }

            userAddress.address.push(newAddress);
            await userAddress.save();
        }

        return res.status(200).json({ success: true, message: "Address saved successfully" });

    } catch (error) {
        console.error("Error in postAddAddress:", error);
        res.redirect('/pageNotFound');
    }
};
const editAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const userData = await User.findById(user)

        const currentAddress = await Address.findOne({ address: { $elemMatch: { _id: addressId } } });

        if (!currentAddress) {
            return res.redirect('/pageNotFound');
        }

        const addressData = currentAddress.address.find((item) => item._id.toString() === addressId);

        if (!addressData) {
            console.log('Address not found for ID:', addressId);
            return res.redirect('/pageNotFound');
        }

        res.render('edit-address', {
             address: addressData, 
             user,
             profilePicture: userData.profilePicture || null,
             });
    } catch (error) {
        console.error('Error in edit address:', error);
        res.redirect('/pageNotFound');
    }
};
const postEditAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.body.addressId; 
        console.log(addressId);
        
        console.log('Received addressId:', addressId);
        console.log('Form data:', data);

        const user = req.session.user;

      
        if (!user || !user._id) {
            console.log('User session invalid');
            return res.redirect('/login'); 
        }

        
        const findAddress = await Address.findOne({
            userId: user._id,
            'address._id': addressId,
        });

        if (!findAddress) {
            console.log('Address not found for ID:', addressId);
            return res.redirect('/pageNotFound');
        }

        
        if (data.isDefault === 'on') {
            await Address.updateMany(
                { userId: user._id, 'address._id': { $ne: addressId } },
                { $set: { 'address.$[].isDefault': false } }
            );
        }

       
        await Address.updateOne(
            { userId: user._id, 'address._id': addressId },
            {
                $set: {
                    'address.$.addressType': data.addressType,
                    'address.$.name': data.name,
                    'address.$.city': data.city,
                    'address.$.landMark': data.landMark,
                    'address.$.state': data.state,
                    'address.$.pincode': data.pincode,
                    'address.$.phone': data.phone,
                    'address.$.altPhone': data.altPhone,
                    'address.$.isDefault': data.isDefault === 'on', // Handle isDefault checkbox
                },
            }
        );

        console.log('Address updated successfully');
        return res.redirect('/addresses');
    } catch (error) {
        console.error('Error in edit address:', error);
        return res.redirect('/pageNotFound');
    }
};
const deleteAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const findAddress=await Address.findOne({'address._id':addressId});
        if(!findAddress){
            return res.status(400).send('Address not found');
        }
        await Address.updateOne({
            'address._id':addressId
        },
        {
          $pull :{
            address :{
                _id:addressId,

            }
          }  
        }
    )
    res.redirect('/addresses')
    } catch (error) {
        console.error("Error in deleting the address",error);
        res.redirect('/pageNotFound');
        
    }
  };
 const removeProfilePhoto = async (req, res) => {
    try {
        const userId = req.session.user;
    
        
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
  
      const user = await User.findByIdAndUpdate(userId, { profilePicture: null });
  
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      res.json({ message: 'Profile photo removed successfully.' });
    } catch (err) {
      console.error('Error removing profile photo:', err);
      res.status(500).json({ message: 'Server error while removing profile photo.' });
    }
  };

  const setDefaultAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const userAddress = await Address.findOne({ userId });
        if (!userAddress) {
            return res.status(404).json({ message: 'No addresses found' });
        }

        const addressExists = userAddress.address.some(
            (addr) => addr._id.toString() === addressId
        );
        if (!addressExists) {
            return res.status(404).json({ message: 'Address not found' });
        }

        userAddress.address.forEach((addr) => {
            addr.isDefault = false;
        });

        const targetAddress = userAddress.address.find(
            (addr) => addr._id.toString() === addressId
        );
        targetAddress.isDefault = true;

        await userAddress.save();

        res.status(200).json({ message: 'Default address updated successfully' });
    } catch (error) {
        console.error('Error in setDefaultAddress:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
module.exports={
    getForgotPassword,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    getEditProfile,
    updateProfile,
    changePassword,
    changePasswordValid,
    verifyChangePassOtp,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail,
    addAddress,
    userAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress,
    removeProfilePhoto,
    setDefaultAddress,

}