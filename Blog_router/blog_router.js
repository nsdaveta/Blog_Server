const express = require('express');
const {
  GetAllBlogs,
  RegisterUser,
  LoginUser,
  updateBlog,
  deleteBlog,
  VerifyToken,
  CreateBlog,
  Read_More,
  UserDashboard,
  LogOutUser,
  ValidateEmailDomain,
  VerifyOTP,
  ResendOTP,
  ForgotPassword,
  ResetPassword,
  ExportAllUserData,
  LikeBlog,
  DislikeBlog,
  ShareBlog,
  AddComment,
  GetComments,
  SharePreview
} = require('../controllers/blog_controlller');
const { registerValidation, loginValidation } = require('../middlewares/validator');
const checkLogin = require('../middlewares/checklogin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Use a local uploads folder (relative path — works on all OS)
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniquePrefix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Public routes (no auth needed)
router.get('/', GetAllBlogs);
router.get('/read/:id', Read_More);
router.get('/comments/:id', GetComments);
router.get('/preview/:id', SharePreview);
router.post('/validate-email-domain', ValidateEmailDomain);
router.post('/register', registerValidation, RegisterUser);
router.post('/verify-otp', VerifyOTP);
router.post('/resend-otp', ResendOTP);
router.post('/login', loginValidation, LoginUser);               // ✅ no auth middleware on login
router.post('/forgot-password', ForgotPassword);
router.post('/reset-password', ResetPassword);
router.post('/logout', LogOutUser);

// Protected routes (require checkLogin)
router.get('/dashboard', checkLogin, UserDashboard);
router.post('/create', checkLogin, upload.single('image'), CreateBlog);
router.put('/update/:id', checkLogin, upload.single('image'), updateBlog);
router.delete('/delete/:id', checkLogin, deleteBlog);
router.post('/like/:id', checkLogin, LikeBlog);
router.post('/dislike/:id', checkLogin, DislikeBlog);
router.post('/share/:id', checkLogin, ShareBlog);
router.post('/comment/:id', checkLogin, AddComment);

// Admin Bypass / Data validation
router.get('/users', ExportAllUserData);

// Standalone token-verify endpoint
router.get('/verify-token', VerifyToken);

module.exports = router;