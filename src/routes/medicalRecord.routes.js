const express = require('express');
const medicalRecordController = require('../controllers/medicalRecord.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// 1. Bác sĩ bắt đầu ca khám (Waiting -> InProgress, tự động nhả chuồng chờ và khởi tạo bản nháp)
router.post(
  '/service/:appointmentServiceId/start',
  authorize('Veterinarian'),
  medicalRecordController.startConsultation
);

// 2. Bác sĩ lưu nháp bệnh án chuẩn SOAP, kê đơn thuốc (BR-16) và cập nhật cân nặng thú cưng
router.put(
  '/service/:appointmentServiceId',
  authorize('Veterinarian'),
  medicalRecordController.saveDraft
);

// 3. Bác sĩ hoàn tất bệnh án SOAP (BR-13, BR-14), kết thúc ca khám và chuyển đơn sang WaitOwner (BR-09)
router.post(
  '/service/:appointmentServiceId/complete',
  authorize('Veterinarian'),
  medicalRecordController.completeConsultation
);

// 4. Xem chi tiết bệnh án SOAP của 1 ca khám (nhân sự hoặc đúng chủ nuôi theo BR-23)
router.get(
  '/service/:appointmentServiceId',
  authorize('Veterinarian', 'Groomer', 'Receptionist', 'Admin', 'PetOwner'),
  medicalRecordController.getByServiceId
);

// 5. Xem tiền sử bệnh lý của 1 thú cưng (Medical History Drawer - UC-32, BR-23)
router.get(
  '/pet/:petId',
  authorize('Veterinarian', 'Groomer', 'Receptionist', 'Admin', 'PetOwner'),
  medicalRecordController.getHistoryByPetId
);

module.exports = router;

