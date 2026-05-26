const express = require('express')
const db = require('../config/firebase')
const adminAuth = require('../middleware/adminAuth')
const { writeAuditLog } = require('../utils/auditLog')

const router = express.Router()
router.use(adminAuth)

const allowed = [
    'brand_name',
    'headline',
    'subheadline',
    'about',
    'phone',
    'email',
    'location',
    'address',
    'cta_label',
    'cta_url'
]

router.get('/', async (req, res) => {
    const snap = await db.realtime.ref('site_settings').get()
    res.json(snap.val() || {})
})

router.patch('/', async (req, res) => {
    const updates = {}
    allowed.forEach((field) => {
        if (req.body[field] !== undefined) updates[field] = req.body[field]
    })

    await db.realtime.ref('site_settings').update({
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: req.admin.adminId
    })

    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'UPDATE_SITE',
        targetType: 'site',
        req,
        metadata: { updated_fields: Object.keys(updates) }
    })

    res.json({ message: 'Site settings updated' })
})

module.exports = router
