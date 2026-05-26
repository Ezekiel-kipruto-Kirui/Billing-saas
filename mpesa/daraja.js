const axios = require('axios')

function getMpesaBaseUrl(environment) {
    return environment === 'sandbox'
        ? 'https://sandbox.safaricom.co.ke'
        : 'https://api.safaricom.co.ke'
}

function getTimestamp() {
    const now = new Date()
    const pad = (value) => String(value).padStart(2, '0')

    return [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds())
    ].join('')
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '')

    if (digits.startsWith('254') && digits.length === 12) {
        return digits
    }

    if (digits.startsWith('0') && digits.length === 10) {
        return `254${digits.slice(1)}`
    }

    if (digits.startsWith('7') && digits.length === 9) {
        return `254${digits}`
    }

    return digits
}

function getCallbackUrl(tenant) {
    const configuredBase = process.env.MPESA_CALLBACK_BASE_URL ||
        process.env.MPESA_CALLBACK_URL ||
        tenant.mpesa_callback_base_url ||
        tenant.mpesa_callback_url

    if (!configuredBase) {
        throw new Error('MPESA_CALLBACK_BASE_URL is not configured')
    }

    const baseUrl = configuredBase
        .replace(/\/api\/mpesa\/callback\/?.*$/, '')
        .replace(/\/api\/mpesacallback\/?.*$/, '')
        .replace(/\/$/, '')

    return `${baseUrl}/api/mpesa/callback/${tenant.id}`
}

function validateTenantCredentials(tenant) {
    const required = [
        'mpesa_consumer_key',
        'mpesa_consumer_secret',
        'mpesa_shortcode',
        'mpesa_business_shortcode',
        'mpesa_shortcode_type',
        'mpesa_passkey'
    ]
    const missing = required.filter((field) => !tenant[field])

    if (missing.length) {
        throw new Error(`Missing tenant M-Pesa fields: ${missing.join(', ')}`)
    }
}

async function getAccessToken(tenant) {
    const baseUrl = getMpesaBaseUrl(tenant.mpesa_environment || process.env.MPESA_ENVIRONMENT)
    const auth = Buffer
        .from(`${tenant.mpesa_consumer_key}:${tenant.mpesa_consumer_secret}`)
        .toString('base64')

    const response = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
            Authorization: `Basic ${auth}`
        }
    })

    return response.data.access_token
}

async function initiateStkPush({ tenant, phone, amount, accountReference, transactionDesc }) {
    validateTenantCredentials(tenant)

    const environment = tenant.mpesa_environment || process.env.MPESA_ENVIRONMENT || 'production'
    const baseUrl = getMpesaBaseUrl(environment)
    const timestamp = getTimestamp()
    const businessShortCode = String(tenant.mpesa_shortcode)
    const passkey = tenant.mpesa_passkey
    const password = Buffer
        .from(`${businessShortCode}${passkey}${timestamp}`)
        .toString('base64')
    const token = await getAccessToken({ ...tenant, mpesa_environment: environment })
    const normalizedPhone = normalizePhone(phone)
    const callbackUrl = getCallbackUrl(tenant)

    if (!/^2547\d{8}$/.test(normalizedPhone) && !/^2541\d{8}$/.test(normalizedPhone)) {
        throw new Error('Invalid M-Pesa phone number. Use 2547XXXXXXXX or 07XXXXXXXX.')
    }

    const response = await axios.post(
        `${baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
            BusinessShortCode: businessShortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: tenant.mpesa_shortcode_type,
            Amount: Math.ceil(Number(amount)),
            PartyA: normalizedPhone,
            PartyB: String(tenant.mpesa_business_shortcode || tenant.mpesa_shortcode),
            PhoneNumber: normalizedPhone,
            CallBackURL: callbackUrl,
            AccountReference: String(accountReference || tenant.business_name || 'Internet').slice(0, 12),
            TransactionDesc: String(transactionDesc || 'Internet package payment').slice(0, 100)
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }
    )

    return {
        ...response.data,
        phone: normalizedPhone,
        callbackUrl,
        environment
    }
}

module.exports = {
    getCallbackUrl,
    initiateStkPush,
    normalizePhone
}
