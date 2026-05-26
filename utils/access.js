const db = require('../config/firebase')
const { createCustomerAccess, createHotspotProfile, enableCustomerAccess } = require('../mikrotik/api')

function toAccessUsername(phone) {
    return String(phone || '').replace(/\D/g, '')
}

async function findCustomerByPhone(tenantId, phone) {
    const customersSnap = await db.realtime.ref(`tenants/${tenantId}/customers`).get()
    let customer = null

    customersSnap.forEach((child) => {
        if (String(child.val().phone) === String(phone)) {
            customer = { id: child.key, ...child.val() }
        }
    })

    return customer
}

async function findPackageByName(tenantId, packageName) {
    const packagesSnap = await db.realtime.ref(`tenants/${tenantId}/packages`).get()
    let pkg = null

    packagesSnap.forEach((child) => {
        if (child.val().name === packageName) {
            pkg = { id: child.key, ...child.val() }
        }
    })

    return pkg
}

async function activatePaidAccess({ tenant, paymentId, payment, phone, mpesaCode }) {
    const tenantId = tenant.id
    const packageName = payment?.package_name
    const username = toAccessUsername(phone)
    const password = String(mpesaCode)
    let customer = await findCustomerByPhone(tenantId, phone)
    const serviceType = payment?.service_type || customer?.service_type || 'hotspot'
    const packageForAccess = packageName || customer?.package
    const pkg = await findPackageByName(tenantId, packageForAccess)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + Number(pkg?.duration_days || 1))

    if (customer) {
        await db.realtime.ref(`tenants/${tenantId}/customers/${customer.id}`).update({
            username: customer.username || username,
            password,
            package: packageForAccess,
            service_type: serviceType,
            status: 'active',
            expiry_date: expiry.toISOString(),
            last_payment_id: paymentId,
            last_mpesa_code: mpesaCode,
            auto_reconnect: true,
            updated_at: new Date().toISOString()
        })
        customer = {
            ...customer,
            username: customer.username || username,
            password,
            package: packageForAccess,
            service_type: serviceType
        }
    } else {
        const customerRef = await db.realtime.ref(`tenants/${tenantId}/customers`).push({
            name: phone,
            phone,
            username,
            password,
            package: packageForAccess,
            service_type: serviceType,
            status: 'active',
            expiry_date: expiry.toISOString(),
            last_payment_id: paymentId,
            last_mpesa_code: mpesaCode,
            auto_reconnect: true,
            created_at: new Date().toISOString()
        })
        customer = { id: customerRef.key, username, service_type: serviceType, password, package: packageForAccess }
    }

    if (serviceType === 'hotspot' && pkg) {
        await createHotspotProfile(tenant, pkg.name, pkg.speed)
    }

    await createCustomerAccess(tenant, {
        ...customer,
        password,
        package_name: packageForAccess,
        service_type: serviceType
    })
    await enableCustomerAccess(tenant, {
        ...customer,
        service_type: serviceType
    })

    await db.realtime.ref(`tenants/${tenantId}/payments/${paymentId}`).update({
        customer_id: customer.id,
        access_username: customer.username,
        access_password: password,
        access_expires_at: expiry.toISOString(),
        access_status: 'active',
        auto_reconnect: true
    })

    return {
        username: customer.username,
        password,
        expiry_date: expiry.toISOString()
    }
}

module.exports = {
    activatePaidAccess,
    findCustomerByPhone,
    toAccessUsername
}
