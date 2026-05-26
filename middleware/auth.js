const jwt = require('jsonwebtoken')
const db = require('../config/firebase')

const authMiddleware = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]

    if (!token) {
        return res.status(401).json({ message: 'No token provided' })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        const tenantDoc = await db.realtime.ref(`tenants/${decoded.id}`).get()

        if (!tenantDoc.exists()) {
            return res.status(401).json({ message: 'Tenant not found' })
        }

        // attach tenant to request
        req.tenant = { id: tenantDoc.key, ...tenantDoc.val() }
        next()

    } catch (err) {
        res.status(401).json({ message: 'Invalid token' })
    }
}

module.exports = authMiddleware
