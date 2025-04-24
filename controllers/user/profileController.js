const User =require('../../models/userSchema')
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();
const session = require('express-session')
 

// function generateOtp(){
//     const digits='1234567890';
//     let otp="";
//     for(let i=0;i<6;i++){
//         otp+=digits[Math.floor(Math.random()*1)];
//     }
//     return otp;

// }
// const sendVerificationEmail = async(email,otp)=>{
//     try {
//         const transporter = nodemailer.createTransport({
//             service:"gmail",
//             port:587,
//             secure:false,
//             requireTLS:true,
//             auth:{
//                 user:process.env.NODEMAILER_EMAIL,
//                 pass:process.env.NODEMAILER_PASSWORD
//             }
//         })
//         const mailOptions ={
//             from:process.env.NODEMAILER_EMAIL,
//             to:email,
//             subject:"Your otp for password reset"
//         }
//     } catch (error) {
        
//     }
// }

// const getForgotPassword =async(req,res)=>{
//     try {
//         res.render('forgot-password')
//     } catch (error) {
//         res.redirect('/pageNotFound')
        
//     }
// }
// const forgotEmailValid = async(req,res)=>{
//     try {
//         const {email}=req.body;
//         const findUser=User.findOne({email:email});
//         if(findUser){
//             const otp = generateOtp();
//             const emailSent = await sendVerificationEmail(email,otp)

//         }
//     } catch (error) {
        
//     }
// }

// module.exports={
//     getForgotPassword,
// }