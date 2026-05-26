const { RouterOSAPI } = require('node-routeros')
const { logError, logInfo, tenantRouterContext } = require('../utils/logger')
const { patchRouterOsEmptyReply } = require('../utils/routerosCompat')

patchRouterOsEmptyReply()

async function connect(tenant) {
    logInfo('MikroTik connect attempt', tenantRouterContext(tenant))

    const conn = new RouterOSAPI({
        host: tenant.mikrotik_host,
        user: tenant.mikrotik_user,
        password: tenant.mikrotik_pass,
        port: Number(tenant.mikrotik_port || 8728),
        timeout: 8000
    })

    try {
        await conn.connect()
        logInfo('MikroTik connected', tenantRouterContext(tenant))
        return conn
    } catch (err) {
        logError('MikroTik connection failed', err, tenantRouterContext(tenant))
        throw err
    }
}

async function findHotspotUser(conn, username) {
    const users = await conn.write('/ip/hotspot/user/print', [`?name=${username}`])
    return users?.[0] || null
}

async function findPppSecret(conn, username) {
    const secrets = await conn.write('/ppp/secret/print', [`?name=${username}`])
    return secrets?.[0] || null
}

async function findPppProfile(conn, name) {
    const profiles = await conn.write('/ppp/profile/print', [`?name=${name}`])
    return profiles?.[0] || null
}

async function findHotspotProfile(conn, name) {
    const profiles = await conn.write('/ip/hotspot/user/profile/print', [`?name=${name}`])
    return profiles?.[0] || null
}

async function listPppProfiles(tenant) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped listPppProfiles')
        return []
    }

    logInfo('MikroTik PPP profile list start', tenantRouterContext(tenant))

    const conn = await connect(tenant)
    try {
        const profiles = await conn.write('/ppp/profile/print')
        return profiles || []
    } catch (err) {
        logError('MikroTik PPP profile list failed', err, tenantRouterContext(tenant))
        throw err
    } finally {
        conn.close()
    }
}

function hasMikroTikCredentials(tenant) {
    return Boolean(tenant.mikrotik_host && tenant.mikrotik_user && tenant.mikrotik_pass)
}

function normalizeRateLimit(speed) {
    const value = String(speed || '').trim()
    if (!value) return null
    if (value.includes('/')) return value.replace(/\s+/g, '')

    const match = value.match(/^(\d+(?:\.\d+)?)\s*(k|kb|kbps|m|mb|mbps|g|gb|gbps)?$/i)
    if (!match) return value.replace(/\s+/g, '')

    const amount = match[1]
    const unit = (match[2] || 'M').toLowerCase()
    const routerUnit = unit.startsWith('g') ? 'G' : unit.startsWith('k') ? 'K' : 'M'

    return `${amount}${routerUnit}/${amount}${routerUnit}`
}

async function createPppProfile(tenant, name, speed) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped createPppProfile')
        return null
    }

    const rateLimit = normalizeRateLimit(speed)

    logInfo('MikroTik PPP profile sync start', {
        ...tenantRouterContext(tenant),
        profile: name,
        speed,
        rate_limit: rateLimit
    })

    const conn = await connect(tenant)
    try {
        const existing = await findPppProfile(conn, name)
        const fields = [`=name=${name}`]

        if (rateLimit) {
            fields.push(`=rate-limit=${rateLimit}`)
        }

        if (existing?.['.id']) {
            const result = await conn.write('/ppp/profile/set', [
                `=.id=${existing['.id']}`,
                ...fields
            ])

            logInfo('MikroTik PPP profile updated', {
                tenant_id: tenant.id,
                profile: name,
                rate_limit: rateLimit,
                profile_id: existing['.id']
            })

            return result
        }

        const result = await conn.write('/ppp/profile/add', fields)

        logInfo('MikroTik PPP profile created', {
            tenant_id: tenant.id,
            profile: name,
            rate_limit: rateLimit
        })

        return result
    } catch (err) {
        logError('MikroTik PPP profile sync failed', err, {
            ...tenantRouterContext(tenant),
            profile: name,
            speed,
            rate_limit: rateLimit
        })
        throw err
    } finally {
        conn.close()
    }
}

async function createHotspotProfile(tenant, name, speed) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped createHotspotProfile')
        return null
    }

    const rateLimit = normalizeRateLimit(speed)

    logInfo('MikroTik hotspot profile sync start', {
        ...tenantRouterContext(tenant),
        profile: name,
        speed,
        rate_limit: rateLimit
    })

    const conn = await connect(tenant)
    try {
        const existing = await findHotspotProfile(conn, name)
        const fields = [`=name=${name}`]

        if (rateLimit) {
            fields.push(`=rate-limit=${rateLimit}`)
        }

        if (existing?.['.id']) {
            const result = await conn.write('/ip/hotspot/user/profile/set', [
                `=.id=${existing['.id']}`,
                ...fields
            ])

            logInfo('MikroTik hotspot profile updated', {
                tenant_id: tenant.id,
                profile: name,
                rate_limit: rateLimit,
                profile_id: existing['.id']
            })

            return result
        }

        const result = await conn.write('/ip/hotspot/user/profile/add', fields)

        logInfo('MikroTik hotspot profile created', {
            tenant_id: tenant.id,
            profile: name,
            rate_limit: rateLimit
        })

        return result
    } catch (err) {
        logError('MikroTik hotspot profile sync failed', err, {
            ...tenantRouterContext(tenant),
            profile: name,
            speed,
            rate_limit: rateLimit
        })
        throw err
    } finally {
        conn.close()
    }
}

async function createUser(tenant, username, password, profile, options = {}) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped createUser')
        return null
    }

    const conn = await connect(tenant)
    try {
        const existing = await findHotspotUser(conn, username)

        if (existing?.['.id']) {
            await conn.write('/ip/hotspot/user/set', [
                `=.id=${existing['.id']}`,
                `=password=${password}`,
                `=profile=${profile}`,
                `=disabled=${options.disabled ? 'yes' : 'no'}`
            ])
            return existing['.id']
        }

        const result = await conn.write('/ip/hotspot/user/add', [
            `=name=${username}`,
            `=password=${password}`,
            `=profile=${profile}`,
            `=disabled=${options.disabled ? 'yes' : 'no'}`
        ])

        return result
    } finally {
        conn.close()
    }
}

async function createPppoeUser(tenant, username, password, profile, options = {}) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped createPppoeUser')
        return null
    }

    logInfo('MikroTik PPPoE provision start', {
        ...tenantRouterContext(tenant),
        username,
        profile,
        disabled: Boolean(options.disabled)
    })

    const conn = await connect(tenant)
    try {
        const existing = await findPppSecret(conn, username)

        if (existing?.['.id']) {
            logInfo('MikroTik PPPoE secret exists; updating', {
                tenant_id: tenant.id,
                username,
                profile,
                secret_id: existing['.id'],
                disabled: Boolean(options.disabled)
            })

            await conn.write('/ppp/secret/set', [
                `=.id=${existing['.id']}`,
                `=password=${password}`,
                `=profile=${profile}`,
                '=service=pppoe',
                `=disabled=${options.disabled ? 'yes' : 'no'}`
            ])
            return existing['.id']
        }

        const result = await conn.write('/ppp/secret/add', [
            `=name=${username}`,
            `=password=${password}`,
            `=profile=${profile}`,
            '=service=pppoe',
            `=disabled=${options.disabled ? 'yes' : 'no'}`
        ])

        logInfo('MikroTik PPPoE secret created', {
            tenant_id: tenant.id,
            username,
            profile,
            disabled: Boolean(options.disabled)
        })

        return result
    } catch (err) {
        logError('MikroTik PPPoE provision failed', err, {
            ...tenantRouterContext(tenant),
            username,
            profile,
            disabled: Boolean(options.disabled)
        })
        throw err
    } finally {
        conn.close()
    }
}

async function createCustomerAccess(tenant, customer) {
    const serviceType = customer.service_type || 'pppoe'
    const options = { disabled: Boolean(customer.disabled) }

    if (serviceType === 'pppoe') {
        return createPppoeUser(tenant, customer.username, customer.password, customer.package_name || customer.package, options)
    }

    return createUser(tenant, customer.username, customer.password, customer.package_name || customer.package, options)
}

async function enableUser(tenant, username) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped enableUser')
        return null
    }

    const conn = await connect(tenant)
    try {
        const existing = await findHotspotUser(conn, username)

        if (!existing?.['.id']) {
            console.warn(`MikroTik user not found: ${username}`)
            return null
        }

        return conn.write('/ip/hotspot/user/set', [
            `=.id=${existing['.id']}`,
            '=disabled=no'
        ])
    } finally {
        conn.close()
    }
}

async function enablePppoeUser(tenant, username) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped enablePppoeUser')
        return null
    }

    logInfo('MikroTik PPPoE enable start', {
        ...tenantRouterContext(tenant),
        username
    })

    const conn = await connect(tenant)
    try {
        const existing = await findPppSecret(conn, username)

        if (!existing?.['.id']) {
            console.warn(`MikroTik PPPoE secret not found: ${username}`)
            return null
        }

        const result = await conn.write('/ppp/secret/set', [
            `=.id=${existing['.id']}`,
            '=disabled=no'
        ])

        logInfo('MikroTik PPPoE enabled', {
            tenant_id: tenant.id,
            username
        })

        return result
    } catch (err) {
        logError('MikroTik PPPoE enable failed', err, {
            ...tenantRouterContext(tenant),
            username
        })
        throw err
    } finally {
        conn.close()
    }
}

async function enableCustomerAccess(tenant, customer) {
    if ((customer.service_type || 'pppoe') === 'pppoe') {
        return enablePppoeUser(tenant, customer.username)
    }

    return enableUser(tenant, customer.username)
}

async function disableUser(tenant, username) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped disableUser')
        return null
    }

    const conn = await connect(tenant)
    try {
        const existing = await findHotspotUser(conn, username)

        if (!existing?.['.id']) {
            return null
        }

        return conn.write('/ip/hotspot/user/set', [
            `=.id=${existing['.id']}`,
            '=disabled=yes'
        ])
    } finally {
        conn.close()
    }
}

async function disablePppoeUser(tenant, username) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped disablePppoeUser')
        return null
    }

    logInfo('MikroTik PPPoE disable start', {
        ...tenantRouterContext(tenant),
        username
    })

    const conn = await connect(tenant)
    try {
        const existing = await findPppSecret(conn, username)

        if (!existing?.['.id']) {
            return null
        }

        const result = await conn.write('/ppp/secret/set', [
            `=.id=${existing['.id']}`,
            '=disabled=yes'
        ])

        logInfo('MikroTik PPPoE disabled', {
            tenant_id: tenant.id,
            username
        })

        return result
    } catch (err) {
        logError('MikroTik PPPoE disable failed', err, {
            ...tenantRouterContext(tenant),
            username
        })
        throw err
    } finally {
        conn.close()
    }
}

async function disableCustomerAccess(tenant, customer) {
    if ((customer.service_type || 'pppoe') === 'pppoe') {
        return disablePppoeUser(tenant, customer.username)
    }

    return disableUser(tenant, customer.username)
}

async function changeProfile(tenant, username, profile) {
    if (!hasMikroTikCredentials(tenant)) {
        console.warn('MikroTik credentials missing; skipped changeProfile')
        return null
    }

    const conn = await connect(tenant)
    try {
        const existing = await findHotspotUser(conn, username)

        if (!existing?.['.id']) {
            return null
        }

        return conn.write('/ip/hotspot/user/set', [
            `=.id=${existing['.id']}`,
            `=profile=${profile}`
        ])
    } finally {
        conn.close()
    }
}

module.exports = {
    createCustomerAccess,
    createHotspotProfile,
    createPppProfile,
    createPppoeUser,
    createUser,
    disableCustomerAccess,
    disablePppoeUser,
    enableCustomerAccess,
    enablePppoeUser,
    enableUser,
    listPppProfiles,
    disableUser,
    changeProfile
}
