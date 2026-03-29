const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    author: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    image: {
        url: { type: String, required: true },
        public_id: { type: String, required: true }
    }
}, { timestamps: true });

const Blogs = mongoose.model('Blogs', blogSchema);
module.exports = Blogs;