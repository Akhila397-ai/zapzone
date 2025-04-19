const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('./config/passport');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const userMiddleware = require('./middlewares/userMiddleware'); // Optional middleware if used

dotenv.config(); // Load env variables

const app = express();

// Connect to DB
db();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'defaultsecret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set true if using HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 72 // 72 hours
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Custom middleware to expose session user in views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Set EJS and views paths
app.set('view engine', 'ejs');
app.set('views', [
    path.join(__dirname, 'views'),
    path.join(__dirname, 'views/admin'),
    path.join(__dirname, 'views/user')
]);

// Public folder
app.use(express.static(path.join(__dirname, 'public')));
app.use('/Uploads', express.static(path.join(__dirname, 'public/Uploads')));

// Routes
app.use('/', userRouter);
app.use('/admin', adminRouter);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(` Server running at: http://localhost:${PORT}`);
});

module.exports = app;
