// 1. Nạp biến môi trường từ tệp .env (BẮT BUỘC ĐẶT Ở DÒNG ĐẦU TIÊN)
require('dotenv').config();

const express = require('express');
// 2. Import hàm connectDB từ đường dẫn tệp db.js của bạn (chỉnh lại đường dẫn nếu cần)
const connectDB = require('./src/config/db');

const app = express();

// 3. Thực hiện kết nối tới MongoDB Atlas
connectDB();

// Middleware để đọc dữ liệu JSON từ body request
app.use(express.json());

app.get('/', async (req, res) => {
    try {
        res.send({ message: 'Welcome to Practical Exam!' });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

const PORT = process.env.PORT || 9999;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));