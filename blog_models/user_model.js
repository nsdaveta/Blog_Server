const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    passwordHistory: [{
        type: String
    }],
    otp: {
        type: String
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Partial TTL Index: auto-delete UNVERIFIED accounts after 24 hours
// Verified accounts are never deleted by this index
userSchema.index({ createdAt: 1 }, {
    expireAfterSeconds: 86400,
    partialFilterExpression: { isVerified: false }
});

module.exports = mongoose.model('User', userSchema);
