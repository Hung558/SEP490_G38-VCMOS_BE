const express = require('express');
const subtaskRequestController = require('../controllers/subtaskRequest.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');
const { uploadSubtaskResultPhoto } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(protect);

// 1. Bác sĩ chính chỉ định cận lâm sàng / dịch vụ phụ cho ca khám đang thực hiện (UC-33)
router.post(
  '/',
  authorize('Veterinarian'),
  subtaskRequestController.createSubtask
);

// 2. Nhân sự (Veterinarian / Groomer) xem danh sách Sub-task được giao cho chính mình (SCR-24, UC-34)
router.get(
  '/my-queue',
  authorize('Veterinarian', 'Groomer'),
  subtaskRequestController.getMyQueue
);

// 3. Xem danh sách Sub-task của 1 ca khám (theo dõi kết quả hoặc chủ nuôi hợp lệ theo BR-23)
router.get(
  '/service/:appointmentServiceId',
  authorize('Veterinarian', 'Groomer', 'Receptionist', 'Admin', 'PetOwner'),
  subtaskRequestController.getByAppointmentServiceId
);

// 4. Xem chi tiết 1 Sub-task
router.get(
  '/:id',
  authorize('Veterinarian', 'Groomer', 'Receptionist', 'Admin', 'PetOwner'),
  subtaskRequestController.getById
);

// 5. Nhân sự được giao nhận thực hiện Sub-task (Pending -> InProgress)
router.patch(
  '/:id/start',
  authorize('Veterinarian', 'Groomer'),
  subtaskRequestController.startSubtask
);

// 6. Nhân sự được giao trả kết quả (text / ảnh resultImage trên Cloudinary) và hoàn tất (Completed)
router.patch(
  '/:id/complete',
  authorize('Veterinarian', 'Groomer'),
  uploadSubtaskResultPhoto,
  subtaskRequestController.completeSubtask
);

// 7. Bác sĩ đã tạo hủy Sub-task khi còn Pending
router.delete(
  '/:id',
  authorize('Veterinarian'),
  subtaskRequestController.deletePendingSubtask
);

module.exports = router;

