const express = require('express')
const db = require('../config/firebase')

const router = express.Router()

const defaultContent = {
    brand_name: 'Billing SaaS',
    headline: 'Internet billing built for hotspot businesses',
    subheadline: 'Sell packages, collect M-Pesa payments, and activate MikroTik users automatically.',
    about: 'We help hotspot operators manage customers, packages, payments, and access control from one secure platform.',
    phone: '+254 700 000 000',
    email: 'support@example.com',
    location: 'Nairobi, Kenya',
    address: 'Nairobi, Kenya',
    cta_label: 'Register your business',
    cta_url: '/register'
}

router.get('/site', async (req, res) => {
    try {
        const snap = await db.realtime.ref('site_settings').get()
        res.json({ ...defaultContent, ...(snap.val() || {}) })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

module.exports = router
