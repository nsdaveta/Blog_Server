const jwt = require('jsonwebtoken');
const api_error = require('../helpers/api_error');

const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';

const checkLogin = (req, res, next) => {
    const header = req.headers.authorization;
    try {
        if (!header) {
            return next(new api_error('No token provided', 401));
        }
        const token = header.split(' ')[1]; // strip "Bearer "
        if (!token) {
            return next(new api_error('No token provided', 401));
        }
        const { id } = jwt.verify(token, JWT_SECRET);
        req.userId = id;
        next();
    } catch (err) {
        return next(new api_error('Invalid or expired token', 403));
    }
};

module.exports = checkLogin;