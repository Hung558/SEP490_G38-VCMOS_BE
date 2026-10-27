const express = require('express');
const multer = require('multer');
const { protect } = require('../middlewares/auth.middleware');
const petController = require('../controllers/pet.controller');

const router = express.Router();

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB, keep in sync with pet.validator.js

// Memory storage: the controller reads req.file.buffer and the service streams it to Cloudinary.
// File type is verified by the validator (real file signature), not by the client's mimetype.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_SIZE, files: 1 },
});

/**
 * Wraps `upload.single('photo')` so multer errors (file too large, wrong field name, ...)
 * return a 400 in the same { message } format as the controller, instead of reaching
 * the global error handler as a 500.
 */
const uploadPhoto = (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: 'Ảnh không được vượt quá 5MB.',
        LIMIT_UNEXPECTED_FILE: 'Tệp ảnh phải được gửi với tên trường "photo".',
      };
      return res.status(400).json({ message: messages[err.code] || 'Tệp tải lên không hợp lệ.' });
    }

    return next(err);
  });
};

// Every pet route requires a logged-in user; ownership is enforced in the service via req.user.id.
router.use(protect);

router
  .route('/')
  .get(petController.listPets) //                      GET    /pets
  .post(uploadPhoto, petController.createPet); //       POST   /pets

router
  .route('/:petId')
  .get(petController.getPetById) //                    GET    /pets/:petId
  .patch(uploadPhoto, petController.updatePet) //      PATCH  /pets/:petId
  .delete(petController.deletePet); //                 DELETE /pets/:petId (soft delete)

module.exports = router;