const crypto = require('crypto');
const cloudinary = require('../config/cloudinary');
const Pet = require('../models/Pet');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;
const PHOTO_FOLDER = 'pets';

// Fields an owner is allowed to change. `code`, `ownerId` and `status` are excluded on purpose.
const UPDATABLE_FIELDS = ['name', 'species', 'breed', 'coatColor', 'notes', 'dob', 'weight'];

const createError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const generatePetCode = () => {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `PET-${suffix}`; // e.g. PET-K7M2QX
};

const isDuplicateCodeError = (err) =>
  err && err.code === 11000 && (err.keyPattern?.code || /code/.test(err.message));

/* ------------------------------ Cloudinary ------------------------------ */

/**
 * Upload a photo to Cloudinary and return its secure URL.
 * `photo` can be a Buffer (e.g. multer memory storage), or a file path / data URI / remote URL string.
 */
const uploadPhoto = async (photo) => {
  const options = { folder: PHOTO_FOLDER, resource_type: 'image' };

  if (Buffer.isBuffer(photo)) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (err, result) =>
        err ? reject(err) : resolve(result.secure_url)
      );
      stream.end(photo);
    });
  }

  const result = await cloudinary.uploader.upload(photo, options);
  return result.secure_url;
};

// Extract the public_id from a Cloudinary URL, e.g.
// https://res.cloudinary.com/demo/image/upload/v1699999999/pets/abc123.jpg -> pets/abc123
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?([^/]+\/[^/]+|[^/]+)\.[^./]+$/);
  return match ? match[1] : null;
};

// Best-effort removal: a failed cleanup should never fail the main operation.
const removePhoto = async (url) => {
  const publicId = getPublicIdFromUrl(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error(`Failed to delete Cloudinary image "${publicId}":`, err.message);
  }
};

/* --------------------------------- CRUD --------------------------------- */

/**
 * Create a pet owned by `ownerId`.
 * @param {string} ownerId
 * @param {object} data   - name (required), species, breed, coatColor, notes, dob, weight
 * @param {Buffer|string} [photo] - optional photo to upload to Cloudinary
 */
const createPet = async (ownerId, data, photo) => {
  const fields = {};
  for (const key of UPDATABLE_FIELDS) {
    if (data[key] !== undefined) fields[key] = data[key];
  }

  const photoUrl = photo ? await uploadPhoto(photo) : undefined;

  try {
    // Retry only on code collisions (unique index is the source of truth).
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      try {
        return await Pet.create({
          ...fields,
          ownerId,
          code: generatePetCode(),
          ...(photoUrl && { photoUrl }),
        });
      } catch (err) {
        if (!isDuplicateCodeError(err)) throw err;
      }
    }
    throw createError('Không thể tạo mã thú cưng. Vui lòng thử lại.', 500);
  } catch (err) {
    if (photoUrl) await removePhoto(photoUrl); // don't leave an orphaned image behind
    throw err;
  }
};

/**
 * Get a single pet by id, only if it belongs to `ownerId`.
 */
const getPetById = async (ownerId, petId) => {
  const pet = await Pet.findOne({ _id: petId, ownerId });
  if (!pet) throw createError('Không tìm thấy thú cưng', 404);
  return pet;
};

/**
 * List the owner's pets, newest first, with pagination.
 * @param {string} ownerId
 * @param {object} [options]
 * @param {'Active'|'Deleted'|'All'} [options.status='Active']
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 */
const listPets = async (ownerId, { status = 'Active', page = 1, limit = 20 } = {}) => {
  const filter = { ownerId };
  if (status !== 'All') filter.status = status;

  const [items, total] = await Promise.all([
    Pet.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Pet.countDocuments(filter),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Update a pet owned by `ownerId`. Only whitelisted fields are applied.
 * If `photo` is provided, it replaces the existing photo (the old one is removed from Cloudinary).
 */
const updatePet = async (ownerId, petId, data = {}, photo) => {
  const pet = await Pet.findOne({ _id: petId, ownerId });
  if (!pet) throw createError('Không tìm thấy thú cưng', 404);
  if (pet.status === 'Deleted') throw createError('Không thể cập nhật các thú cưng đã bị xóa', 409);

  for (const key of UPDATABLE_FIELDS) {
    if (data[key] !== undefined) pet[key] = data[key];
  }

  const oldPhotoUrl = pet.photoUrl;
  let newPhotoUrl;
  if (photo) {
    newPhotoUrl = await uploadPhoto(photo);
    pet.photoUrl = newPhotoUrl;
  }

  try {
    await pet.save();
  } catch (err) {
    if (newPhotoUrl) await removePhoto(newPhotoUrl);
    throw err;
  }

  if (newPhotoUrl && oldPhotoUrl) await removePhoto(oldPhotoUrl);
  return pet;
};

/**
 * "Delete" a pet: soft delete by setting status to 'Deleted'.
 * The record and its photo are kept. Idempotent.
 */
const deletePet = async (ownerId, petId) => {
  const pet = await Pet.findOneAndUpdate(
    { _id: petId, ownerId },
    { $set: { status: 'Deleted' } },
    { new: true }
  );
  if (!pet) throw createError('Không tìm thấy thú cưng', 404);
  return pet;
};

module.exports = {
  createPet,
  getPetById,
  listPets,
  updatePet,
  deletePet,
};