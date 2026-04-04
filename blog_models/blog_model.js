const mongoose = require('mongoose');

// Tracks how many times a specific user performed an action on this blog
const actionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    count:  { type: Number, default: 0 }
}, { _id: false });

const commentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:   { type: String, required: true },
    text:   { type: String, required: true },
}, { timestamps: true });

const blogSchema = new mongoose.Schema({
    author:   { type: String, required: true },
    title:    { type: String, required: true },
    content:  { type: String, required: true },
    image: {
        url:       { type: String, required: true },
        public_id: { type: String, required: true }
    },
    likes:    [actionSchema],   // per-user like counts
    dislikes: [actionSchema],   // per-user dislike counts
    shares:   [actionSchema],   // per-user share counts
    comments: [commentSchema]   // each comment is a separate entry
}, { timestamps: true });

const Blogs = mongoose.model('Blogs', blogSchema);
module.exports = Blogs;