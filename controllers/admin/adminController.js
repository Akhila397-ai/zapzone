const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { session } = require('passport');

const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/dashboard'); 
    }
    res.render("admin-login", { message: null }); 
};


const pagenotfound=async(req,res)=>{
    res.render('admin-error')
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body; 

        if (!email || !password) {
            return res.redirect('/admin/login');
        }

        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.redirect('/admin/login'); 
        }

        const passwordMatch = await bcrypt.compare(password, admin.password); 

        if (passwordMatch) {
            req.session.admin = admin._id;
            console.log("Login successful!");
            return res.redirect('/admin/dashboard');
        } else {
            console.log("Incorrect password.");
            return res.redirect('/admin/admin-login'); 
        }
    } catch (error) {
        console.log("Login error:", error);
        req.session.message = "Page not found";
        return res.redirect('/pagenotfound');
    }
};



const loadDashboard=async(req,res)=>{
    if(req.session.admin){
        try {
            res.render('dashboard')
        } catch (error) {
            res.redirect('/pagenotfound')
            
        }
    }
}

const logout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
                console.log("Error while destroying the session:", err);
                return res.redirect('/pagenotfound');
            }
            console.log("Admin session destroyed. Redirecting to /admin/login");
            return res.redirect('/admin/login');  
        });
    } catch (error) {
        console.log("Unexpected error while logout:", error);
        return res.redirect('/pagenotfound');
    }
};






module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pagenotfound,
    logout,
};
