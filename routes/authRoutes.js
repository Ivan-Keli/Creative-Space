const express = require('express');
const router = express.Router();
const { User } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

// ✅ User Signup (Register)
router.post('/signup', [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    try {
        // Check if the email is already registered
        const userExists = await User.findOne({ where: { email } });
        if (userExists) {
            return res.status(400).json({ error: "Email already registered" });
        }

        // Sequelize Hook will handle password hashing automatically
        const user = await User.create({
            name,
            email,
            password, // Raw password; Sequelize will hash it before saving.
            role: 'buyer' // Default role assignment
        });

        res.status(201).json({ message: "✅ User registered successfully!", userId: user.id, role: user.role });
    } catch (error) {
        console.error("❌ Signup Error:", error);
        res.status(500).json({ error: "Server error during signup" });
    }
});

// ✅ User Login
router.post('/login', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        // 🔍 Check if the user exists by email
        const user = await User.findOne({ where: { email } });

        if (!user) {
            console.error(`❌ User not found for email: ${email}`);
            return res.status(400).json({ error: "Invalid email or password" });
        }

        console.log(`✅ User found:`, user.email);

        // 🔍 Debug hashed password comparison
        console.log(`🔍 Hashed password in DB: ${user.password}`);
        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`🔍 Password match status: ${isMatch}`);

        if (!isMatch) {
            console.error(`❌ Password mismatch for user: ${email}`);
            return res.status(400).json({ error: "Invalid email or password" });
        }

        // ✅ Check if JWT_SECRET is defined
        if (!process.env.JWT_SECRET) {
            console.error('❌ JWT_SECRET is not defined in the environment variables.');
            return res.status(500).json({ error: "Server configuration error" });
        }

        // ✅ Generate JWT Token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ message: "✅ Login successful", token, userId: user.id, role: user.role });

    } catch (error) {
        console.error("❌ Login Error:", error);
        res.status(500).json({ error: "Server error during login" });
    }
});

// Add logout endpoint
router.post('/logout', (req, res) => {
    // Since JWT is stateless, we don't need to do much server-side
    // The client will handle removing the token
    res.json({ message: 'Successfully logged out' });
});

module.exports = router;
