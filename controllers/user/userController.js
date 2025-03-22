const pageNotFound=async(req,res)=>{
    try {
        res.render('page-404')
    } catch (error) {
        res.redirect('/pageNotFound')
        
    }
}




const loadHomepage = (req, res) => {
    try {
        res.render('home'); // Ensure this view exists
    } catch (error) {
        console.error("Error loading homepage:", error);
        res.status(500).send("Server error"); // ✅ Now 'res' is properly defined
    }
};

module.exports = { loadHomepage,pageNotFound };
