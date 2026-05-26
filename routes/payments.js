const express = require('express')
const db = require('../config/firebase')
const { initiateStkPush, normalizePhone } = require('../mpesa/daraja')

const router = express.Router()

router.get('/', async (req, res) => {
    try {
        const snapshot = await db.realtime.ref(`tenants/${req.tenant.id}/payments`).get()

        const payments = []
        snapshot.forEach((child) => payments.push({ id: child.key, ...child.val() }))

        res.json(payments)
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

router.post('/pay', async (req, res) => {
    const { customer_id, customer_name, phone, amount, package_name, service_type } = req.body

    if (!phone) {
        return res.status(400).json({ message: 'Customer phone is required' })
    }

    try {
        const normalizedPhone = normalizePhone(phone)
        const ref = await db.realtime.ref(`tenants/${req.tenant.id}/payments`).push({
                customer_id: customer_id || null,
                customer_name: customer_name || null,
                package_name: package_name || null,
                service_type: service_type || 'pppoe',
                amount: Number(amount || 0),
                mpesa_code: null,
                phone: normalizedPhone,
                status: 'pending',
                paid_at: null,
                initiated_at: new Date().toISOString()
            })

        const stk = await initiateStkPush({
            tenant: req.tenant,
            phone: normalizedPhone,
            amount,
            accountReference: package_name || customer_name || 'Internet',
            transactionDesc: `${package_name || 'Internet'} payment`
        })

        await ref.update({
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
            paymentId: ref.key,
            checkoutRequestId: stk.CheckoutRequestID
        })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

module.exports = router
