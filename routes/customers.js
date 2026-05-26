const express = require('express')
const router = express.Router()
const db = require('../config/firebase')
const { createCustomerAccess, createPppProfile } = require('../mikrotik/api')
const { logError, logInfo, logWarn, tenantRouterContext } = require('../utils/logger')

const HOME_FIBER_SERVICE_TYPE = 'pppoe'

function hasMikroTikCredentials(tenant) {
    return Boolean(tenant.mikrotik_host && tenant.mikrotik_user && tenant.mikrotik_pass)
}

function toProvisioningMessage(err, profileName) {
    if (String(err?.message || '').includes('input does not match any value of profile')) {
        return `MikroTik PPP profile "${profileName}" does not exist and could not be created from the selected package. Sync the package profile from the Packages page.`
    }

    return `MikroTik provisioning failed: ${err.message}`
}

async function findPackageByName(tenantId, packageName) {
    const snapshot = await db.realtime.ref(`tenants/${tenantId}/packages`).get()
    let found = null

    snapshot.forEach((child) => {
        const value = child.val()
        if (String(value?.name || '').toLowerCase() === String(packageName).toLowerCase()) {
            found = { id: child.key, ...value }
        }
    })

    return found
}

async function ensureSystemProfile(tenant, packageName) {
    const pkg = await findPackageByName(tenant.id, packageName)

    if (!pkg) {
        const err = new Error(`Package "${packageName}" was not found`)
        err.statusCode = 404
        throw err
    }

    await createPppProfile(tenant, pkg.name, pkg.speed)
    await db.realtime
        .ref(`tenants/${tenant.id}/packages/${pkg.id}`)
        .update({
            ppp_profile_status: 'synced',
            ppp_profile_synced_at: new Date().toISOString(),
            ppp_profile_error: null
        })
}

async function usernameExists(tenantId, username) {
    const customersSnap = await db.realtime.ref(`tenants/${tenantId}/customers`).get()
    let exists = false

    customersSnap.forEach((child) => {
        if (String(child.val()?.username || '').toLowerCase() === String(username).toLowerCase()) {
            exists = true
        }
    })

    return exists
}

// get all customers for this tenant
router.get('/', async (req, res) => {
    const snapshot = await db.realtime.ref(`tenants/${req.tenant.id}/customers`).get()

    const customers = []
    snapshot.forEach((child) => customers.push({ id: child.key, ...child.val() }))

    res.json(customers)
})

router.get('/hotspot-portal', async (req, res) => {
    const baseUrl = (
        process.env.PUBLIC_APP_URL ||
        `${req.protocol}://${req.get('host')}`
    ).replace(/\/$/, '')
    const tenantId = req.tenant.id

    res.json({
        tenant_id: tenantId,
        portal_url: `${baseUrl}/customers/${tenantId}`,
        fallback_portal_url: `${baseUrl}/portal/${tenantId}`,
        hotspot_url: `${baseUrl}/hotspot/${tenantId}`,
        description: 'Use the customers portal URL as the MikroTik hotspot redirect/login target so customers can select a package and pay for internet access.'
    })
})

// add new customer
router.post('/add', async (req, res) => {
    const {
        name,
        phone,
        username,
        password,
        package_name,
        provision_mikrotik = true
    } = req.body

    if (!name || !phone || !username || !password || !package_name) {
        return res.status(400).json({ message: 'Name, phone, username, password, and package are required' })
    }

    try {
        logInfo('Customer create request received', {
            tenant_id: req.tenant.id,
            business_name: req.tenant.business_name,
            customer_name: name,
            phone,
            username,
            package_name,
            provision_mikrotik: Boolean(provision_mikrotik)
        })

        if (await usernameExists(req.tenant.id, username)) {
            logWarn('Customer create blocked; duplicate username', {
                tenant_id: req.tenant.id,
                username
            })
            return res.status(409).json({ message: 'A customer with this username already exists' })
        }

        let provisioningStatus = 'not_requested'
        let provisioningMessage = null

        if (provision_mikrotik) {
            if (!hasMikroTikCredentials(req.tenant)) {
                logWarn('Customer create blocked; missing MikroTik credentials', {
                    tenant_id: req.tenant.id,
                    business_name: req.tenant.business_name,
                    has_host: Boolean(req.tenant.mikrotik_host),
                    has_user: Boolean(req.tenant.mikrotik_user),
                    has_password: Boolean(req.tenant.mikrotik_pass)
                })
                return res.status(400).json({
                    message: 'Configure MikroTik credentials before provisioning customers'
                })
            }

            try {
                logInfo('Customer MikroTik provisioning start', {
                    ...tenantRouterContext(req.tenant),
                    username,
                    package_name,
                    service_type: HOME_FIBER_SERVICE_TYPE
                })

                await ensureSystemProfile(req.tenant, package_name)
                await createCustomerAccess(req.tenant, {
                    username,
                    password,
                    package_name,
                    service_type: HOME_FIBER_SERVICE_TYPE,
                    disabled: true
                })
                provisioningStatus = 'provisioned'
                provisioningMessage = 'Home fiber PPPoE secret created on MikroTik and kept disabled until payment'
            } catch (err) {
                logError('Customer MikroTik provisioning failed', err, {
                    ...tenantRouterContext(req.tenant),
                    username,
                    package_name,
                    service_type: HOME_FIBER_SERVICE_TYPE
                })
                return res.status(err.statusCode || 502).json({
                    message: err.statusCode ? err.message : toProvisioningMessage(err, package_name)
                })
            }
        }

        const customerRef = await db.realtime
            .ref(`tenants/${req.tenant.id}/customers`)
            .push({
                name,
                phone,
                username,
                password,
                package: package_name,
                service_type: HOME_FIBER_SERVICE_TYPE,
                provisioning_status: provisioningStatus,
                provisioning_message: provisioningMessage,
                status: 'inactive',
                expiry_date: null,
                auto_reconnect: true,
                created_at: new Date().toISOString()
            })

        logInfo('Customer saved successfully', {
            tenant_id: req.tenant.id,
            customer_id: customerRef.key,
            username,
            provisioning_status: provisioningStatus
        })

        res.json({
            success: true,
            message: provisioningMessage || 'Customer added',
            customerId: customerRef.key
        })

    } catch (err) {
        logError('Add customer error', err, {
            tenant_id: req.tenant?.id,
            username,
            package_name
        })
        res.status(500).json({ message: err.message })
    }
})

// provision or re-provision an existing customer on MikroTik
router.post('/:customerId/provision', async (req, res) => {
    try {
        logInfo('Customer reprovision request received', {
            tenant_id: req.tenant.id,
            customer_id: req.params.customerId
        })

        if (!hasMikroTikCredentials(req.tenant)) {
            logWarn('Customer reprovision blocked; missing MikroTik credentials', {
                tenant_id: req.tenant.id,
                has_host: Boolean(req.tenant.mikrotik_host),
                has_user: Boolean(req.tenant.mikrotik_user),
                has_password: Boolean(req.tenant.mikrotik_pass)
            })
            return res.status(400).json({
                message: 'Configure MikroTik credentials before provisioning customers'
            })
        }

        const customerSnap = await db.realtime
            .ref(`tenants/${req.tenant.id}/customers/${req.params.customerId}`)
            .get()

        if (!customerSnap.exists()) {
            return res.status(404).json({ message: 'Customer not found' })
        }

        const customer = { id: customerSnap.key, ...customerSnap.val() }

        logInfo('Customer MikroTik reprovision start', {
            ...tenantRouterContext(req.tenant),
            customer_id: customer.id,
            username: customer.username,
            package_name: customer.package,
            service_type: HOME_FIBER_SERVICE_TYPE
        })

        await ensureSystemProfile(req.tenant, customer.package)
        await createCustomerAccess(req.tenant, {
            ...customer,
            package_name: customer.package,
            service_type: HOME_FIBER_SERVICE_TYPE,
            disabled: customer.status !== 'active'
        })

        await db.realtime
            .ref(`tenants/${req.tenant.id}/customers/${req.params.customerId}`)
            .update({
                provisioning_status: 'provisioned',
                service_type: HOME_FIBER_SERVICE_TYPE,
                auto_reconnect: true,
                provisioning_message: 'Home fiber PPPoE secret synced on MikroTik',
                provisioned_at: new Date().toISOString()
            })

        res.json({ success: true, message: 'Customer provisioned on MikroTik' })
    } catch (err) {
        logError('Customer reprovision failed', err, {
            tenant_id: req.tenant?.id,
            customer_id: req.params.customerId
        })
        res.status(502).json({ message: toProvisioningMessage(err, 'selected package') })
    }
})

// delete customer
router.delete('/:customerId', async (req, res) => {
    await db.realtime.ref(`tenants/${req.tenant.id}/customers/${req.params.customerId}`).remove()

    res.json({ success: true, message: 'Customer deleted' })
})

module.exports = router
