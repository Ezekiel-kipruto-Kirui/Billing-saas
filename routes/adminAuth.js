const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../config/firebase')
const { adminLoginLimiter } = require('../middleware/rateLimiter')
const { writeAuditLog } = require('../utils/auditLog')

const router = express.Router()

router.post('/login', adminLoginLimiter, async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' })
    }

    try {
        const normalizedEmail = email.toLowerCase().trim()
        const snap = await db.realtime
            .ref('admins')
            .orderByChild('email')
            .equalTo(normalizedEmail)
            .limitToFirst(1)
            .get()

        if (!snap.exists()) {
            await bcrypt.hash('dummy-password-for-timing', 12)
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        let adminId = null
        let adminData = null
        snap.forEach((child) => {
            adminId = child.key
            adminData = child.val()
        })

        if (!adminData?.is_active) {
            return res.status(403).json({ error: 'Account deactivated' })
        }

        const valid = await bcrypt.compare(password, adminData.password)
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        const loginCount = (adminData.login_count || 0) + 1
        await db.realtime.ref(`admins/${adminId}`).update({
            last_login: new Date().toISOString(),
            login_count: loginCount
        })

        const token = jwt.sign(
            {
                adminId,
                email: adminData.email,
                name: adminData.name,
                role: 'admin'
            },
            process.env.ADMIN_JWT_SECRET,
            { expiresIn: '4h' }
        )

        await writeAuditLog({
            adminId,
            adminEmail: adminData.email,
            action: 'LOGIN',
            targetId: adminId,
            targetType: 'admin',
            req,
            metadata: { login_count: loginCount }
        })

        res.json({
            token,
            admin: {
                id: adminId,
                name: adminData.name,
                email: adminData.email,
                role: adminData.role
            }
        })
    } catch (err) {
        console.error('Admin login error:', err)
        res.status(500).json({ error: 'Login failed' })
    }
})

module.exports = router
