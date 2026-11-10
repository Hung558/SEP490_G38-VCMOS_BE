const medicalRecordService = require('../services/medicalRecord.service');
const {
  validateObjectIdParam,
  validateMedicalRecordPayload,
} = require('../validators/medicalRecord.validator');

const handleControllerError = (res, err) => {
  if (err && err.statusCode) {
    const response = { message: err.message };
    if (err.errors) response.errors = err.errors;
    return res.status(err.statusCode).json(response);
  }
  console.error('MedicalRecord controller error:', err);
  return res.status(500).json({ message: 'Lỗi máy chủ khi xử lý hồ sơ bệnh án' });
};

/**
 * POST /api/medical-records/service/:appointmentServiceId/start
 * Bác sĩ bắt đầu ca khám: chuyển Waiting -> InProgress, tự động nhả chuồng chờ (BR-10) và tạo bản nháp bệnh án
 */
const startConsultation = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.appointmentServiceId, 'Mã dịch vụ lịch hẹn');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã dịch vụ lịch hẹn không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const result = await medicalRecordService.startMedicalConsultation(req.user.id, idCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * PUT /api/medical-records/service/:appointmentServiceId
 * Bác sĩ lưu nháp bệnh án chuẩn SOAP, kê đơn thuốc (UC-36, BR-16) và cập nhật cân nặng thú cưng
 */
const saveDraft = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.appointmentServiceId, 'Mã dịch vụ lịch hẹn');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã dịch vụ lịch hẹn không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const bodyCheck = validateMedicalRecordPayload(req.body, { requireAllSoap: false });
    if (!bodyCheck.isValid) {
      return res.status(400).json({
        message: 'Dữ liệu bệnh án không hợp lệ',
        errors: bodyCheck.errors,
      });
    }

    const record = await medicalRecordService.saveDraftMedicalRecord(
      req.user.id,
      idCheck.value,
      bodyCheck.value
    );
    return res.status(200).json(record);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * POST /api/medical-records/service/:appointmentServiceId/complete
 * Bác sĩ hoàn tất bệnh án SOAP (UC-37, BR-13), khóa bệnh án (BR-14), chuyển đơn sang WaitOwner (BR-09)
 */
const completeConsultation = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.appointmentServiceId, 'Mã dịch vụ lịch hẹn');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã dịch vụ lịch hẹn không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const bodyCheck = validateMedicalRecordPayload(req.body, { requireAllSoap: true });
    if (!bodyCheck.isValid) {
      return res.status(400).json({
        message: 'Dữ liệu hoàn tất bệnh án không hợp lệ',
        errors: bodyCheck.errors,
      });
    }

    const result = await medicalRecordService.completeMedicalConsultation(
      req.user.id,
      idCheck.value,
      bodyCheck.value
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/medical-records/service/:appointmentServiceId
 * Xem bệnh án SOAP của 1 ca khám (kiểm tra quyền riêng tư BR-23)
 */
const getByServiceId = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.appointmentServiceId, 'Mã dịch vụ lịch hẹn');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã dịch vụ lịch hẹn không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const record = await medicalRecordService.getMedicalRecordByServiceId(req.user, idCheck.value);
    return res.status(200).json(record);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/medical-records/pet/:petId
 * Xem lịch sử bệnh án của 1 thú cưng (Medical History Drawer - UC-32, BR-23)
 */
const getHistoryByPetId = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.petId, 'Mã thú cưng');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã thú cưng không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const history = await medicalRecordService.getMedicalHistoryByPetId(req.user, idCheck.value);
    return res.status(200).json(history);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

module.exports = {
  startConsultation,
  saveDraft,
  completeConsultation,
  getByServiceId,
  getHistoryByPetId,
};

