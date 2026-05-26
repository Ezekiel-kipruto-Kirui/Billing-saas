const express = require('express')
const router = express.Router()
const db = require('../config/firebase')
const { activatePaidAccess } = require('../utils/access')

router.post('/callback/:tenantId', async (req, res) => {
    const { tenantId } = req.params
    const result = req.body?.Body?.stkCallback

    if (!result) {
        return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    const checkoutRequestId = result.CheckoutRequestID || null
    const merchantRequestId = result.MerchantRequestID || null

    const findCallbackValue = (name) => {
        const items = result.CallbackMetadata?.Item || []
        return items.find((item) => item.Name === name)?.Value
    }

    if (result.ResultCode === 0) {
        const amount = findCallbackValue('Amount')
        const mpesaCode = findCallbackValue('MpesaReceiptNumber')
        const phone = findCallbackValue('PhoneNumber')

        try {
            const tenantDoc = await db.realtime.ref(`tenants/${tenantId}`).get()
            const tenant = { id: tenantDoc.key, ...tenantDoc.val() }

            const paymentsSnap = await db.realtime.ref(`tenants/${tenantId}/payments`).get()
            let paymentId = null
            let payment = null
            paymentsSnap.forEach((child) => {
                const value = child.val()
                if (
                    value.checkout_request_id === checkoutRequestId ||
                    value.merchant_request_id === merchantRequestId
                ) {
                    paymentId = child.key
                    payment = value
                }
            })

            if (paymentId) {
                await db.realtime.ref(`tenants/${tenantId}/payments/${paymentId}`).update({
                    amount,
                    mpesa_code: mpesaCode,
                    phone,
                    status: 'success',
                    paid_at: new Date().toISOString(),
                    callback_result_code: result.ResultCode,
                    callback_result_desc: result.ResultDesc || null
                })
            } else {
                await db.realtime.ref(`tenants/${tenantId}/payments`).push({
                    amount,
                    mpesa_code: mpesaCode,
                    phone,
                    status: 'success',
                    paid_at: new Date().toISOString(),
                    checkout_request_id: checkoutRequestId,
                    merchant_request_id: merchantRequestId,
                    callback_result_code: result.ResultCode,
                    callback_result_desc: result.ResultDesc || null,
                    source: 'mpesa_callback'
                })
            }

            if (paymentId) {
                const access = await activatePaidAccess({
                    tenant,
                    paymentId,
                    payment,
                    phone,
                    mpesaCode
                })

                console.log(`[${tenant.business_name}] Activated: ${access.username}`)
            }

        } catch (err) {
            console.error('Callback error:', err.message)
        }
    } else {
        try {
            const paymentsSnap = await db.realtime.ref(`tenants/${tenantId}/payments`).get()
            let paymentId = null
            paymentsSnap.forEach((child) => {
                const value = child.val()
                if (
                    value.checkout_request_id === checkoutRequestId ||
                    value.merchant_request_id === merchantRequestId
                ) {
                    paymentId = child.key
                }
            })

            if (paymentId) {
                await db.realtime.ref(`tenants/${tenantId}/payments/${paymentId}`).update({
                    status: 'failed',
                    callback_result_code: result.ResultCode,
                    callback_result_desc: result.ResultDesc || null,
                    failed_at: new Date().toISOString()
                })
            }
        } catch (err) {
            console.error('Failed callback update error:', err.message)
        }
    }

    res.json({ ResultCode: 0, ResultDesc: 'Success' })
})

module.exports = router
