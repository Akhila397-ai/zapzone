const { session } = require('passport');
const User=require('../models/userSchema');

const userAuth=(req,res,next)=>{
    if(req.session.user){
        
        User.findById(req.session.user)
        .then(user=>{
            if(user&& !user.isBlocked){
                next();
            }else{
               const blocked = {isBlocked:true};
               if(blocked){
                req.session.destroy((err)=>{
                    if(err){
                        console.log("error while destroying the session");
                        
                    }else{
                        console.log("session forcefully destroyed successfully");
                        res.redirect('/login')
                        
                    }
                })
               }

               

            }
        })
        .catch(error=>{
            console.log("Error in user auth middleware");
            res.status(500).send('internal server error')
        })
    }else{
        res.redirect('/login')
    }
}
const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        User.findById(req.session.admin)
            .then(user => {
                if (user && user.isAdmin) {
                    req.user = user; // Optional: attach user to request
                    next();
                } else {
                    res.redirect('/admin/login');
                }
            })
            .catch(error => {
                console.log("Error in admin auth middleware", error);
                res.status(500).send('Internal Server Error');
            });
    } else {
        res.redirect('/admin/login');
    }
};

module.exports={
    userAuth,
    adminAuth
}