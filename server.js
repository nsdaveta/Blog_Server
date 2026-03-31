require('dotenv').config();
const express = require('express');
const BlogRouter = require('./Blog_router/blog_router');
const mongoose = require('mongoose');
const cors = require('cors');
const api_error = require('./helpers/api_error');

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB Database Successfully');
    })
    .catch((err) => {
        console.log('Error connecting to MongoDB Database:', err);
    });

const app = express();
app.use(cors());
app.use(express.json());

// Mount all blog/user routes under /blog (matches client calls)
app.use('/blog', BlogRouter);

// Global error handler
function error_middleware(err, req, res, next) {
    res.status(err.status_code || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
}
app.use(error_middleware);

app.listen(process.env.PORT || 5000, () => {
    const port = process.env.PORT || 5000;
    const serverUrl = (process.env.SERVER_URL && process.env.SERVER_URL !== 'undefined') ? process.env.SERVER_URL : `http://localhost:${port}`;
    console.log('Server is listening on port', port);
    console.log('                   -------------------------');
    console.log('Server running at: |', serverUrl, '|');
    console.log('                   -------------------------');
});