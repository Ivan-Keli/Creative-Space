const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const path = require('path');

// Configure Cloudinary storage for different upload types
const createCloudinaryStorage = (folderName) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `creativespace/${folderName}`,
      format: async (req, file) => {
        // Determine format based on file extension
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.png') return 'png';
        if (ext === '.gif') return 'gif';
        if (ext === '.webp') return 'webp';
        if (ext === '.pdf') return 'pdf'; // Add PDF support
        return 'jpg'; // Default to jpg for jpeg and other formats
      },
      public_id: (req, file) => {
        // Create unique filename with timestamp and original name
        const fileName = file.originalname.split('.')[0];
        return `${fileName}_${Date.now()}`;
      },
      // Add responsive transformations for artwork images
      transformation: [
        { width: 800, crop: "limit" } // Limit max width to 800px
      ]
    }
  });
};

// Default storage
const storage = createCloudinaryStorage('uploads');

// Create specialized storage for different types of content
const profileStorage = createCloudinaryStorage('profiles');
const artworkStorage = createCloudinaryStorage('artworks');
const photoStorage = createCloudinaryStorage('photos');
const publicationStorage = createCloudinaryStorage('publications');
const eventStorage = createCloudinaryStorage('events');

// Updated file filter to include PDFs for publications
const fileFilter = (req, file, cb) => {
  // For publication uploads, allow PDFs
  if (req.originalUrl.includes('/publications/upload') && file.mimetype === 'application/pdf') {
    return cb(null, true);
  }
  
  // Check if the file is an image
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  
  // Check for specific image types
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Invalid image format. Allowed formats: JPEG, PNG, GIF, WebP'), false);
  }
  
  cb(null, true);
};

// Size limits for different types of uploads
const defaultLimits = {
  fileSize: 5 * 1024 * 1024, // 5MB
};

const artworkLimits = {
  fileSize: 10 * 1024 * 1024, // 10MB for artwork
};

const enhancedLimits = {
  fileSize: 50 * 1024 * 1024, // 50MB for enhanced uploads
};

// Create default upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: defaultLimits,
});

// Create specialized upload middleware
const profileUpload = multer({
  storage: profileStorage,
  fileFilter,
  limits: defaultLimits,
});

const artworkUpload = multer({
  storage: artworkStorage,
  fileFilter,
  limits: artworkLimits,
});

// New specialized upload middleware for enhanced uploads
const photoUpload = multer({
  storage: photoStorage,
  fileFilter,
  limits: enhancedLimits,
});

const publicationUpload = multer({
  storage: publicationStorage,
  fileFilter: (req, file, cb) => {
    // Only allow PDFs for publications
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for publications!'), false);
    }
  },
  limits: enhancedLimits,
});

const eventUpload = multer({
  storage: eventStorage,
  fileFilter,
  limits: enhancedLimits,
});

// Export all middleware
module.exports = upload;
module.exports.profileUpload = profileUpload;
module.exports.artworkUpload = artworkUpload;
module.exports.photoUpload = photoUpload;
module.exports.publicationUpload = publicationUpload;
module.exports.eventUpload = eventUpload;

// Also export a simpler function to use in routes
module.exports.uploadImage = upload.single('image');
module.exports.uploadProfilePicture = profileUpload.single('profilePicture');
module.exports.uploadArtwork = artworkUpload.single('image');
module.exports.uploadPhoto = photoUpload.single('image');
module.exports.uploadPublication = publicationUpload.single('file');
module.exports.uploadEventBanner = eventUpload.single('banner');
