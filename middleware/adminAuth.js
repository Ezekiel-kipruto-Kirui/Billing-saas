const jwt = require('jsonwebtoken')
const db = require('../config/firebase')

module.exports = async (req, res, next) => {
    if (
        process.env.NODE_ENV === 'production' &&
        req.headers['x-forwarded-proto'] !== 'https'
    ) {
        return res.status(403).json({ error: 'HTTPS required' })
    }

    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
        return res.status(401).json({ error: 'Admin token required' })
    }

    try {
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET)

        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Insufficient privileges' })
        }

        const adminSnap = await db.realtime.ref(`admins/${decoded.adminId}`).get()
        const adminData = adminSnap.val()

        if (!adminSnap.exists() || !adminData?.is_active) {
            return res.status(403).json({ error: 'Admin account inactive' })
        }

        req.admin = {
            adminId: decoded.adminId,
            email: decoded.email,
            name: decoded.name,
            role: decoded.role
        }

        next()
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Admin session expired' })
        }

        return res.status(403).json({ error: 'Invalid admin token' })
    }
}
