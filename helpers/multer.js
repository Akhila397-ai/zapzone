const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = path.join(__dirname, '..', '..', 'public', 'uploads', 'temp');
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
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

module.exports = upload;