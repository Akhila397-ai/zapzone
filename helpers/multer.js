const multer = require('multer');
const path = require('path');
const fs = require('fs'); // 
const fsp = require('fs/promises');





const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = path.join(__dirname, '..', '..', 'public', 'uploads', 'temp');
        try {
            await fsp.mkdir(dir, { recursive: true }); // Use fsp.mkdir for promise-based operation
            cb(null, dir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/\s+/g, '_');
        cb(null, `${timestamp}-${sanitizedName}`);
    }
});
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const extname = /\.(jpe?g|png|webp)$/i.test(path.extname(file.originalname));
    const mimetype = allowedTypes.includes(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, JPG, PNG, and WEBP image files are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024, 
        files: 4
    },
    fileFilter: fileFilter
});
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', '..', 'public', 'Uploads', 'profile-pictures');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/\s+/g, '_');
        cb(null, `${timestamp}-${sanitizedName}`);
    }
});

const uploadProfilePicture = multer({
    storage: profileStorage,
    limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const extname = /\.(jpe?g|png|webp)$/i.test(path.extname(file.originalname));
        const mimetype = allowedTypes.includes(file.mimetype);

        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, JPG, PNG, and WEBP image files are allowed'));
        }
    }
});
module.exports = {upload,uploadProfilePicture};