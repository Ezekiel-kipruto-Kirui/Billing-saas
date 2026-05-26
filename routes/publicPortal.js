const express = require('express')
const db = require('../config/firebase')
const { initiateStkPush, normalizePhone } = require('../mpesa/daraja')
const { enableUser } = require('../mikrotik/api')

const router = express.Router()

function listFromSnapshot(snapshot) {
    const items = []
    snapshot.forEach((child) => items.push({ id: child.key, ...child.val() }))
    return items
}

router.get('/:tenantId', async (req, res) => {
    try {
        const tenantSnap = await db.realtime.ref(`tenants/${req.params.tenantId}`).get()

        if (!tenantSnap.exists()) {
            return res.status(404).json({ message: 'Tenant not found' })
        }

        const tenant = tenantSnap.val()

        res.json({
            id: tenantSnap.key,
            business_name: tenant.business_name,
            phone: tenant.phone,
            status: tenant.status
        })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

router.get('/:tenantId/packages', async (req, res) => {
    try {
        const tenantSnap = await db.realtime.ref(`tenants/${req.params.tenantId}`).get()

        if (!tenantSnap.exists()) {
            return res.status(404).json({ message: 'Tenant not found' })
        }

        if (tenantSnap.val().status === 'suspended') {
            return res.status(403).json({ message: 'Tenant is not accepting payments' })
        }

        const packagesSnap = await db.realtime.ref(`tenants/${req.params.tenantId}/packages`).get()
        const packages = listFromSnapshot(packagesSnap)
            .map((pkg) => ({
                id: pkg.id,
                name: pkg.name,
                speed: pkg.speed,
                duration_days: pkg.duration_days,
                price: pkg.price
            }))
            .sort((a, b) => Number(a.price || 0) - Number(b.price || 0))

        res.json(packages)
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

router.post('/:tenantId/pay', async (req, res) => {
    const { package_id, phone } = req.body

    if (!package_id || !phone) {
        return res.status(400).json({ message: 'Package and phone number are required' })
    }

    try {
        const tenantSnap = await db.realtime.ref(`tenants/${req.params.tenantId}`).get()

        if (!tenantSnap.exists()) {
            return res.status(404).json({ message: 'Tenant not found' })
        }

        if (tenantSnap.val().status === 'suspended') {
            return res.status(403).json({ message: 'Tenant is not accepting payments' })
        }

        const packageSnap = await db.realtime
            .ref(`tenants/${req.params.tenantId}/packages/${package_id}`)
            .get()

        if (!packageSnap.exists()) {
            return res.status(404).json({ message: 'Package not found' })
        }

        const tenant = { id: tenantSnap.key, ...tenantSnap.val() }
        const pkg = packageSnap.val()
        const normalizedPhone = normalizePhone(phone)
        const paymentRef = await db.realtime.ref(`tenants/${req.params.tenantId}/payments`).push({
            customer_id: null,
            customer_name: null,
            package_id,
            package_name: pkg.name,
            amount: Number(pkg.price || 0),
            mpesa_code: null,
            phone: normalizedPhone,
            status: 'pending',
            paid_at: null,
            initiated_at: new Date().toISOString(),
            service_type: 'hotspot',
            source: 'customer_portal'
        })

        const stk = await initiateStkPush({
            tenant,
            phone: normalizedPhone,
            amount: pkg.price,
            accountReference: pkg.name,
            transactionDesc: `${pkg.name} internet package`
        })

        await paymentRef.update({
            merchant_request_id: stk.MerchantRequestID || null,
            checkout_request_id: stk.CheckoutRequestID || null,
            response_code: stk.ResponseCode || null,
            response_description: stk.ResponseDescription || null,
            customer_message: stk.CustomerMessage || null,
            mpesa_callback_url: stk.callbackUrl,
            mpesa_environment: stk.environment,
            stk_requested_at: new Date().toISOString()
        })

        res.json({
            success: true,
            message: stk.CustomerMessage || 'STK push sent',
            paymentId: paymentRef.key,
            checkoutRequestId: stk.CheckoutRequestID
        })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

router.post('/:tenantId/redeem', async (req, res) => {
    const { mpesa_code } = req.body

    if (!mpesa_code) {
        return res.status(400).json({ message: 'M-Pesa transaction code is required' })
    }

    try {
        const tenantSnap = await db.realtime.ref(`tenants/${req.params.tenantId}`).get()

        if (!tenantSnap.exists()) {
            return res.status(404).json({ message: 'Tenant not found' })
        }

        const paymentsSnap = await db.realtime.ref(`tenants/${req.params.tenantId}/payments`).get()
        let payment = null
        paymentsSnap.forEach((child) => {
            const value = child.val()
            if (String(value.mpesa_code || '').toUpperCase() === String(mpesa_code).trim().toUpperCase()) {
                payment = { id: child.key, ...value }
            }
        })

        if (!payment || payment.status !== 'success') {
            return res.status(404).json({ message: 'Paid transaction not found' })
        }

        if (!payment.access_expires_at || new Date(payment.access_expires_at) <= new Date()) {
            return res.status(410).json({ message: 'This package has expired' })
        }

        const tenant = { id: tenantSnap.key, ...tenantSnap.val() }
        if (payment.access_username) {
            await enableUser(tenant, payment.access_username)
        }

        res.json({
            success: true,
            package_name: payment.package_name,
            phone: payment.phone,
            username: payment.access_username,
            password: payment.access_password,
            expires_at: payment.access_expires_at
        })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

module.exports = router
