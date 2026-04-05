const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Blogs = require('../blog_models/blog_model');
const User = require('../blog_models/user_model');
const { cloudinary } = require('../configs/config');
const api_error = require('../helpers/api_error');
const fs = require('fs');
const dns = require('dns').promises;
const { sendEmail, generateOTPHtml } = require('../helpers/sendEmail');

const mongoose = require('mongoose');
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';

// GET all blogs
const GetAllBlogs = async (req, res) => {
    try {
        const blogs = await Blogs.find();
        res.status(200).json(blogs);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching blogs', error: err.message });
    }
};

// POST create blog (requires auth + image upload via multer + cloudinary)
const CreateBlog = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Image file is required' });
        }

        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: "blogs"
        });
        const image_url = result.secure_url;
        const public_id = result.public_id;

        // delete local uploaded file
        fs.unlinkSync(req.file.path);

        const data = req.body;
        const newBlog = new Blogs({
            author: data.author,
            title: data.title,
            content: data.content,
            image: { url: image_url, public_id: public_id }
        });

        await newBlog.save();

        res.status(201).json({
            message: 'Blog created successfully',
            blog: newBlog
        });

    } catch (err) {
        res.status(500).json({
            message: 'Error creating blog',
            error: err.message
        });
    }
};

// GET single blog
const Read_More = async (req, res) => {
    const { id } = req.params;
    try {
        const blog = await Blogs.findById(id);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });
        res.status(200).json(blog);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching blog', error: err.message });
    }
};

// POST /login — verifies token (used as a standalone token-check endpoint)
const VerifyToken = (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1]; // strip "Bearer "
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        res.status(200).json({ message: 'Token is valid', user: decoded });
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// POST /register
const RegisterUser = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields (name, email, password) are required." });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const domain = normalizedEmail.split('@')[1];

        // Verify if the email domain actually exists and has mail records
        try {
            const mxRecords = await dns.resolveMx(domain);
            if (!mxRecords || mxRecords.length === 0) {
                return res.status(400).json({ message: "Invalid email entered, please provide an actual email id" });
            }
        } catch (dnsError) {
            console.error(`DNS lookup failed for ${domain}:`, dnsError.message);
            return res.status(400).json({ message: "Invalid email entered, please provide an actual email id" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            if (existingUser.isVerified) {
                return res.status(400).json({ message: "User already exists and is verified. Please log in." });
            }
        }

        console.log(`[DEV ONLY] OTP for ${normalizedEmail}: ${otp}`);
        console.log(`Attempting to send OTP email to: ${normalizedEmail}`);

        try {
            console.log(`📡 Sending mail...`);
            const success = await sendEmail(normalizedEmail, 'Verify your email - Blogify', generateOTPHtml(otp, "Email Verification"));

            if (success) {
                console.log(`✅ Mail delivered successfully. Proceeding to save user.`);

                const hashedPassword = await bcrypt.hash(password, 10);

                if (existingUser) {
                    existingUser.name = name;
                    existingUser.password = hashedPassword;
                    existingUser.passwordHistory = [hashedPassword];
                    existingUser.otp = otp;
                    existingUser.createdAt = Date.now();
                    await existingUser.save();
                } else {
                    const newUser = new User({
                        name,
                        email: normalizedEmail,
                        password: hashedPassword,
                        passwordHistory: [hashedPassword],
                        otp,
                        isVerified: false
                    });
                    await newUser.save();
                }

                return res.status(201).json({ message: "Registration successful. Please check your email for the OTP." });
            } else {
                return res.status(500).json({
                    message: "Failed to send verification email. Please try again later or check your email domain."
                });
            }
        } catch (mailError) {
            console.error("❌ EMAIL ERROR:", mailError.message);
            return res.status(500).json({
                message: "A network error occurred while sending the email. Nothing has been saved in our database."
            });
        }
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: "Email is already taken." });
        }
        res.status(500).json({ message: 'Error registering user', error: err.message });
    }
};

const ValidateEmailDomain = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ valid: false });

        const domain = email.split('@')[1];
        if (!domain) return res.json({ valid: false });

        const mxRecords = await dns.resolveMx(domain);
        if (mxRecords && mxRecords.length > 0) return res.json({ valid: true });
        res.json({ valid: false });
    } catch (error) {
        res.json({ valid: false });
    }
};

const VerifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required" });

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) return res.status(400).json({ message: "User not found" });
        if (user.otp !== String(otp).trim()) return res.status(400).json({ message: "Invalid OTP" });

        user.isVerified = true;
        user.otp = undefined;
        await user.save();

        res.json({ message: "Email verified successfully." });
    } catch (error) {
        res.status(500).json({ message: error.message || "An internal server error occurred." });
    }
};

const ResendOTP = async (req, res) => {
    try {
        const { email, type } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) return res.status(400).json({ message: "User not found" });
        if (user.isVerified) return res.status(400).json({ message: "User is already verified" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        await user.save();

        try {
            const subject = type === 'initial' ? 'Verify your email - Blogify' : 'Resent OTP - Blogify';
            const htmlTitle = type === 'initial' ? 'Email Verification' : 'Your New OTP';
            const success = await sendEmail(normalizedEmail, subject, generateOTPHtml(otp, htmlTitle));
            if (success) return res.json({ message: "OTP sent successfully. Please check your email." });
            else throw new Error("Mail connection failed");
        } catch (mailError) {
            return res.status(500).json({ message: "Failed to resend OTP. Please try again later." });
        }
    } catch (error) {
        res.status(500).json({ message: "Failed to resend OTP. Please try again later." });
    }
};

const ForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } });
        if (!user) return res.status(404).json({ message: "User not found" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        await user.save();

        try {
            const success = await sendEmail(user.email, 'Password Reset OTP - Blogify', generateOTPHtml(otp, "Your Password Reset OTP"));
            if (success) return res.json({ message: "Password reset OTP sent to your email." });
            else throw new Error("Mail connection failed");
        } catch (mailError) {
            return res.status(500).json({ message: "Failed to send OTP. Please try again later." });
        }
    } catch (error) {
        res.status(500).json({ message: "An internal server error occurred." });
    }
};

const ResetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword, allowReuse } = req.body;
        if (!email || !otp || !newPassword) return res.status(400).json({ message: "Email, OTP, and new password are required" });

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } });

        if (!user) return res.status(400).json({ message: "User not found" });
        if (user.otp !== String(otp).trim()) return res.status(400).json({ message: "Invalid OTP" });

        // Password History Reuse Verification
        let isOldPassword = false;

        if (!allowReuse) {
            // 1. Check against the current active string (protects legacy accounts without history arrays)
            if (user.password && await bcrypt.compare(newPassword, user.password)) {
                isOldPassword = true;
            }

            // 2. Iterate against the exhaustive history array
            if (!isOldPassword && user.passwordHistory && user.passwordHistory.length > 0) {
                for (const oldHash of user.passwordHistory) {
                    if (await bcrypt.compare(newPassword, oldHash)) {
                        isOldPassword = true;
                        break;
                    }
                }
            }
        }

        if (isOldPassword) {
            return res.status(400).json({ message: "You can't use an old password here" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.passwordHistory = user.passwordHistory || [];
        user.passwordHistory.push(hashedPassword);
        user.otp = undefined; // clear OTP
        await user.save();

        res.json({ message: "Password reset successfully. You can now log in." });
    } catch (error) {
        res.status(500).json({ message: "An internal server error occurred." });
    }
};

// POST /login
const LoginUser = async (req, res, next) => {
    const { email, password } = req.body;
    try {
        // Case-insensitive regex to catch legacy accounts that were saved with capital letters
        const user = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, "i") } });
        if (!user) {
            return next(new api_error('No user found! Please register first', 404));
        }
        // ONLY block if it is explicitly set to false. Older accounts without this field (undefined) will pass safely!
        if (user.isVerified === false) {
            return next(new api_error('Please verify your email first!', 400));
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return next(new api_error('Invalid email or password', 400));
        }
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        // Return token AND user object (client needs res.data.user)
        res.status(200).json({
            message: 'Login successful',
            token: token,
            user: { _id: user._id, name: user.name, email: user.email }
        });
    } catch (err) {
        res.status(500).json({ message: 'Error logging in user', error: err.message });
    }
};

// POST /logout — logout is a client concern (clear token); server just acknowledges
const LogOutUser = (req, res) => {
    res.status(200).json({ message: 'User logged out successfully' });
};

// PUT /update/:id
const updateBlog = async (req, res) => {

    try {

        const { id } = req.params
        const { title, content, author } = req.body

        const blog = await Blogs.findById(id)

        if (!blog) {
            return res.status(404).json({ message: "Blog not found" })
        }

        let imageData = blog.image;
        const oldPublicId = blog.image?.public_id;

        if (req.file) {

            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: "blogs"
            })

            imageData = {
                url: result.secure_url,
                public_id: result.public_id
            }

            if (oldPublicId) {
                try {
                    await cloudinary.uploader.destroy(oldPublicId)
                } catch (destroyErr) {
                    console.error("Failed to destroy old Cloudinary image:", destroyErr)
                }
            }

            // delete local uploaded file
            fs.unlinkSync(req.file.path)

        }

        blog.title = title
        blog.content = content
        blog.author = author
        blog.image = imageData

        await blog.save()

        return res.status(200).json({
            message: req.file
                ? "Image and blog updated successfully"
                : "Blog updated successfully",
            blog
        })

    } catch (error) {

        console.error(error)

        return res.status(500).json({
            message: "Server error while updating blog"
        })

    }

};
// DELETE /delete/:id
const deleteBlog = async (req, res) => {
    const { id } = req.params;
    try {
        const deletedBlog = await Blogs.findByIdAndDelete(id);
        if (!deletedBlog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        // Delete image from Cloudinary after confirming blog exists
        const publicId = req.query.public_id;
        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId);
                console.log("Cloudinary image deleted successfully");
            } catch (err) {
                console.error("Failed to destroy Cloudinary image:", err);
            }
        }
        res.status(200).json({ message: 'Blog deleted successfully', blog: deletedBlog });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting blog', error: err.message });
    }
};

// GET /dashboard
const UserDashboard = async (req, res) => {
    const userId = req.userId; // set by checklogin middleware
    try {
        const user = await User.findById(userId).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.status(200).json({ message: 'User dashboard fetched successfully', user });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching user dashboard', error: err.message });
    }
};

// ADMIN ENDPOINT: Explicit JSON dump bypass route
const ExportAllUserData = async (req, res) => {
    try {
        const users = await User.find({});
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ── Shared helper: atomically increment a user's count in a per-user action array ──
// Uses arrayFilters to upsert in one round-trip when possible.
const incrementAction = async (blogId, field, userId) => {
    // Cast userId to ObjectId for strict MongoDB matching in array filters
    const userIdObj = new mongoose.Types.ObjectId(userId);

    // Attempt to increment an existing entry for this user
    let blog = await Blogs.findOneAndUpdate(
        { _id: blogId, [`${field}.userId`]: userIdObj },
        { $inc: { [`${field}.$.count`]: 1 } },
        { new: true }
    );
    if (blog) return blog;

    // No entry yet — push a new one (Mongoose handles casting for push automatically)
    blog = await Blogs.findByIdAndUpdate(
        blogId,
        { $push: { [field]: { userId: userIdObj, count: 1 } } },
        { new: true }
    );
    return blog;
};

// Compute total count (sum across all users) and the current user's count
const actionStats = (blog, field, userId) => {
    const entries = blog[field] || [];
    const total = entries.reduce((sum, e) => sum + (e.count || 0), 0);
    const userCount = entries.find(e => e.userId.toString() === userId.toString())?.count || 0;
    return { total, userCount };
};

// POST /like/:id — Dynamic Toggle & Mutual Exclusivity
const LikeBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const blog = await Blogs.findById(id);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Author Restriction
        if (blog.author === user.name) {
            return res.status(400).json({ message: "The same user who has created the blog can't like the post" });
        }

        // Toggle Like: Check if already liked
        const userLikeIndex = blog.likes.findIndex(item => item.userId.toString() === userId.toString());

        if (userLikeIndex !== -1) {
            blog.likes.splice(userLikeIndex, 1);
        } else {
            blog.likes.push({ userId, count: 1 });
            // Mutual Exclusivity: Remove Dislike if present
            blog.dislikes = blog.dislikes.filter(item => item.userId.toString() !== userId.toString());
        }

        await blog.save();

        const stats = {
            total: blog.likes.reduce((sum, e) => sum + (e.count || 0), 0),
            userCount: blog.likes.find(e => e.userId.toString() === userId.toString())?.count || 0,
            dislikesTotal: blog.dislikes.reduce((sum, e) => sum + (e.count || 0), 0)
        };

        res.status(200).json(stats);
    } catch (err) {
        res.status(500).json({ message: 'Like operation failed' });
    }
};

// POST /dislike/:id — Dynamic Toggle & Mutual Exclusivity
const DislikeBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const blog = await Blogs.findById(id);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Author Restriction
        if (blog.author === user.name) {
            return res.status(400).json({ message: "The same user who has created the blog can't dislike the post" });
        }

        // Toggle Dislike: Check if already disliked
        const userDislikeIndex = blog.dislikes.findIndex(item => item.userId.toString() === userId.toString());

        if (userDislikeIndex !== -1) {
            blog.dislikes.splice(userDislikeIndex, 1);
        } else {
            blog.dislikes.push({ userId, count: 1 });
            // Mutual Exclusivity: Remove Like if present
            blog.likes = blog.likes.filter(item => item.userId.toString() !== userId.toString());
        }

        await blog.save();

        const stats = {
            total: blog.dislikes.reduce((sum, e) => sum + (e.count || 0), 0),
            userCount: blog.dislikes.find(e => e.userId.toString() === userId.toString())?.count || 0,
            likesTotal: blog.likes.reduce((sum, e) => sum + (e.count || 0), 0)
        };

        res.status(200).json(stats);
    } catch (err) {
        res.status(500).json({ message: 'Dislike operation failed' });
    }
};

// POST /share/:id — always increments, tracked per user
const ShareBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const blog = await incrementAction(id, 'shares', userId);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });
        res.status(200).json(actionStats(blog, 'shares', userId));
    } catch (err) {
        res.status(500).json({ message: 'Error recording share', error: err.message });
    }
};

// POST /comment/:id — each comment is a separate document entry (name from User record)
const AddComment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const { text } = req.body;

        if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text is required' });

        const blog = await Blogs.findById(id);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });

        const user = await User.findById(userId).select('name');
        if (!user) return res.status(404).json({ message: 'User not found' });

        blog.comments.push({ userId, name: user.name, text: text.trim() });
        await blog.save();

        const saved = blog.comments[blog.comments.length - 1];
        res.status(201).json({ message: 'Comment added', comment: saved });
    } catch (err) {
        res.status(500).json({ message: 'Error adding comment', error: err.message });
    }
};

// GET /comments/:id — fetch all comments (public)
const GetComments = async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blogs.findById(id).select('comments');
        if (!blog) return res.status(404).json({ message: 'Blog not found' });
        res.status(200).json({ comments: blog.comments });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching comments', error: err.message });
    }
};

// GET /preview/:id — Generate HTML with Meta tags for social media previews
const SharePreview = async (req, res) => {
    try {
        const { id } = req.params;
        let publicClientUrl = process.env.CLIENT_URL;
        
        if (!publicClientUrl) {
            return res.redirect('https://blog-app-01.vercel.app/');
        }

        // Ensure protocol exists (prevent relative redirects)
        if (!publicClientUrl.startsWith('http')) {
            publicClientUrl = `https://${publicClientUrl}`;
        }
        // Remove trailing slash
        publicClientUrl = publicClientUrl.replace(/\/+$/, "");

        // Special case for home page preview or absolute app URL cases
        if (id === "homepage") {
            const redirectUrl = `${publicClientUrl}/`;
            return res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Blog App — Home</title>
                    <meta name="description" content="Discover insightful articles and stories.">
                    <meta property="og:type" content="website">
                    <meta property="og:title" content="Blog App">
                    <meta property="og:description" content="Read the latest stories from our community.">
                    <meta property="og:image" content="${publicClientUrl}/favicon.png">
                    <meta property="og:url" content="${redirectUrl}">
                    <script>window.location.href = "${redirectUrl}";</script>
                </head>
                <body><h1>Redirecting to Home...</h1></body>
                </html>
            `);
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).send("Blog not found");
        }
        const blog = await Blogs.findById(id);
        if (!blog) return res.status(404).send("Blog not found");

        const redirectUrl = `${publicClientUrl}/#/read/${id}`; // Using HashRouter format

        // Send a barebones HTML with OG tags for crawlers, and a redirect for users
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>${blog.title}</title>
                <meta name="description" content="${blog.content.substring(0, 150)}...">
                
                <!-- Open Graph / Meta Tags -->
                <meta property="og:type" content="article">
                <meta property="og:title" content="${blog.title}">
                <meta property="og:description" content="${blog.content.substring(0, 160)}...">
                <meta property="og:image" content="${blog.image.url}">
                <meta property="og:url" content="${redirectUrl}">
                <meta property="og:site_name" content="Blog App">
                
                <!-- Twitter -->
                <meta name="twitter:card" content="summary_large_image">
                <meta name="twitter:title" content="${blog.title}">
                <meta name="twitter:description" content="${blog.content.substring(0, 160)}...">
                <meta name="twitter:image" content="${blog.image.url}">

                <!-- Automatic Redirect for Users -->
                <script>window.location.href = "${redirectUrl}";</script>
            </head>
            <body>
                <h1>Redirecting to: ${blog.title}</h1>
                <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send("Error generating preview");
    }
};

module.exports = { GetAllBlogs, RegisterUser, ValidateEmailDomain, VerifyOTP, ResendOTP, LoginUser, updateBlog, deleteBlog, VerifyToken, UserDashboard, CreateBlog, LogOutUser, Read_More, ForgotPassword, ResetPassword, ExportAllUserData, LikeBlog, DislikeBlog, ShareBlog, AddComment, GetComments, SharePreview };

