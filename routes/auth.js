const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Helper: generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Helper: send validation errors
const handleValidationErrors = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    return null;
};

// @route   POST /api/auth/register
// @desc    Register a new user (employee or employer)
// @access  Public
router.post(
    '/register',
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('email').isEmail().withMessage('Please provide a valid email'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('role').isIn(['employee', 'employer']).withMessage('Role must be either employee or employer'),
    ],
    async (req, res) => {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        try {
            const { name, email, password, role, department, gender } = req.body;

            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(409).json({ success: false, message: 'Email is already registered.' });
            }

            const user = await User.create({ name, email, password, role, department: department || '', gender: gender || '' });

            const token = generateToken(user._id);

            res.status(201).json({
                success: true,
                message: 'Registration successful.',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    department: user.department,
                    gender: user.gender || '',
                },
            });
        } catch (error) {
            console.error('Register error:', error.message);
            res.status(500).json({ success: false, message: 'Server error. Please try again.' });
        }
    }
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
    '/login',
    [
        body('email').isEmail().withMessage('Please provide a valid email'),
        body('password').notEmpty().withMessage('Password is required'),
    ],
    async (req, res) => {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        try {
            const { email, password } = req.body;

            const user = await User.findOne({ email }).select('+password');
            if (!user) {
                return res.status(401).json({ success: false, message: 'Invalid email or password.' });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid email or password.' });
            }

            const token = generateToken(user._id);

            res.status(200).json({
                success: true,
                message: 'Login successful.',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    department: user.department,
                    gender: user.gender || '',
                },
            });
        } catch (error) {
            console.error('Login error:', error.message);
            res.status(500).json({ success: false, message: 'Server error. Please try again.' });
        }
    }
);

// @route   GET /api/auth/me
// @desc    Get current logged-in user
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            user: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
                department: req.user.department,
                gender: req.user.gender || '',
            },
        });
    } catch (error) {
        console.error('Get me error:', error.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
