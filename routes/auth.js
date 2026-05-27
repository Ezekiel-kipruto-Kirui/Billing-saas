const express = require('express')
const router = express.Router()
const db = require('../config/firebase')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { getCallbackUrl } = require('../mpesa/daraja')
const { withTimeout } = require('../utils/async')

const DB_TIMEOUT_MS = parseInt(process.env.DB_TIMEOUT_MS, 10) || 10000

// REGISTER new tenant
router.post('/register', async (req, res) => {
    const {
        business_name, owner_name, email, phone, password
    } = req.body

    try {
        const missing = ['business_name', 'owner_name', 'email', 'phone', 'password']
            .filter((field) => !req.body[field])

        if (missing.length) {
            return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` })
        }

        const normalizedEmail = email.toLowerCase().trim()
        const existing = await db.realtime.ref('tenants')
            .orderByChild('email')
            .equalTo(normalizedEmail)
            .limitToFirst(1)
            .get()

        if (existing.exists()) {
            return res.status(400).json({ message: 'Email already registered' })
        }

        // hash password
        const hashedPassword = await bcrypt.hash(password, 10)

        const tenantRef = await db.realtime.ref('tenants').push({
            business_name,
            owner_name,
            email: normalizedEmail,
            phone,
            password: hashedPassword,
            mikrotik_host: '',
            mikrotik_user: '',
            mikrotik_pass: '',
            mikrotik_port: 8728,
            mpesa_consumer_key: '',
            mpesa_consumer_secret: '',
            mpesa_shortcode: '',
            mpesa_business_shortcode: '',
            mpesa_shortcode_type: 'CustomerBuyGoodsOnline',
            mpesa_passkey: '',
            mpesa_callback_base_url: process.env.MPESA_CALLBACK_BASE_URL || '',
            mpesa_environment: process.env.MPESA_ENVIRONMENT || 'production',
            status: 'pending_setup',
            created_at: new Date().toISOString()
        })
        await tenantRef.update({
            mpesa_callback_url: getCallbackUrl({
                id: tenantRef.key,
                mpesa_callback_base_url: process.env.MPESA_CALLBACK_BASE_URL
            })
        })

        // generate token
        const token = jwt.sign(
            { id: tenantRef.key },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.json({
            success: true,
            message: 'Business registered successfully',
            token,
            tenantId: tenantRef.key
        })

    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

// LOGIN tenant
router.post('/login', async (req, res) => {
    const { email, password } = req.body

    try {
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' })
        }

        const normalizedEmail = email.toLowerCase().trim()
        const snapshot = await withTimeout(
            db.realtime.ref('tenants')
                .orderByChild('email')
                .equalTo(normalizedEmail)
                .limitToFirst(1)
                .get(),
            DB_TIMEOUT_MS,
            'Database lookup timed out while signing in'
        )

        if (!snapshot.exists()) {
            return res.status(404).json({ message: 'Business not found' })
        }

        let tenant = null
        snapshot.forEach((child) => {
            tenant = { id: child.key, ...child.val() }
        })

        // check password
        const match = await bcrypt.compare(password, tenant.password)
        if (!match) {
            return res.status(401).json({ message: 'Wrong password' })
        }

        // generate token
        const token = jwt.sign(
            { id: tenant.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.json({
            success: true,
            token,
            tenant: {
                id: tenant.id,
                business_name: tenant.business_name,
                email: tenant.email
            }
        })

    } catch (err) {
        res.status(err.statusCode || 500).json({ message: err.message })
    }
})

module.exports = router
