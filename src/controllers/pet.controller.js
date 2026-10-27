const petService = require('../services/pet.service');
const {
  validateCreatePet,
  validateUpdatePet,
  validatePetId,
  parseListQuery
} = require('../validators/pet.validator');

/**
 * Errors thrown by the validator/service carry a `statusCode` and a user-safe message.
 * Anything else (database, Cloudinary, bugs) is logged and returned as a generic 500
 * so internal details are never leaked to the client.
 */
const handleError = (res, err) => {
  if (err.statusCode) {
    if (err.statusCode >= 500) console.error(err);
    return res.status(err.statusCode).json({
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }
  console.error(err);
  return res.status(500).json({ message: 'Lỗi máy chủ' });
};

// POST /pets  (multipart/form-data or JSON; optional file field "photo")
const createPet = async (req, res) => {
  try {
    const photo = req.file?.buffer;
    const data = validateCreatePet(req.body, photo);
    const pet = await petService.createPet(req.user.id, data, photo);
    return res.status(201).json({ pet });
  } catch (err) {
    return handleError(res, err);
  }
};

// GET /pets
const listPets = async (req, res) => {
  try {
    const options = parseListQuery(req.query);
    const result = await petService.listPets(req.user.id, options);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
};

// GET /pets/:petId
const getPetById = async (req, res) => {
  try {
    const petId = validatePetId(req.params.petId);
    const pet = await petService.getPetById(req.user.id, petId);
    return res.json({ pet });
  } catch (err) {
    return handleError(res, err);
  }
};

// PATCH /pets/:petId  (multipart/form-data or JSON; optional file field "photo")
const updatePet = async (req, res) => {
  try {
    const petId = validatePetId(req.params.petId);
    const photo = req.file?.buffer;
    const data = validateUpdatePet(req.body, photo);
    const pet = await petService.updatePet(req.user.id, petId, data, photo);
    return res.json({ pet });
  } catch (err) {
    return handleError(res, err);
  }
};

// DELETE /pets/:petId  (soft delete: status -> 'Archived')
const deletePet = async (req, res) => {
  try {
    const petId = validatePetId(req.params.petId);
    const pet = await petService.deletePet(req.user.id, petId);
    return res.json({ message: 'Đã lưu trữ thú cưng', pet });
  } catch (err) {
    return handleError(res, err);
  }
};

module.exports = {
  createPet,
  listPets,
  getPetById,
  updatePet,
  deletePet,
};