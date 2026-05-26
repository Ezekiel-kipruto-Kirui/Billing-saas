const express = require('express')
const db = require('../config/firebase')
const { createHotspotProfile, createPppProfile, listPppProfiles } = require('../mikrotik/api')
const { logError, logInfo, logWarn, tenantRouterContext } = require('../utils/logger')

const router = express.Router()

function hasMikroTikCredentials(tenant) {
    return Boolean(tenant.mikrotik_host && tenant.mikrotik_user && tenant.mikrotik_pass)
}

function toProfileSyncMessage(err, profileName) {
    if (String(err?.message || '').includes('already have such name')) {
        return `MikroTik profile "${profileName}" already exists with conflicting settings.`
    }

    if (String(err?.message || '').includes('invalid value')) {
        return `MikroTik rejected the speed/rate limit for profile "${profileName}". Use a value like 10M, 5M/5M, or 512K.`
    }

    return `MikroTik profile sync failed: ${err.message}`
}

async function packageNameExists(tenantId, name, ignorePackageId = null) {
    const snapshot = await db.realtime.ref(`tenants/${tenantId}/packages`).get()
    let exists = false

    snapshot.forEach((child) => {
        const value = child.val()
        if (
            child.key !== ignorePackageId &&
            String(value?.name || '').toLowerCase() === String(name).toLowerCase()
        ) {
            exists = true
        }
    })

    return exists
}

async function syncRouterProfilesOrFail(req, name, speed) {
    if (!hasMikroTikCredentials(req.tenant)) {
        logWarn('Package save blocked; missing MikroTik credentials', {
            tenant_id: req.tenant.id,
            business_name: req.tenant.business_name,
            has_host: Boolean(req.tenant.mikrotik_host),
            has_user: Boolean(req.tenant.mikrotik_user),
            has_password: Boolean(req.tenant.mikrotik_pass)
        })

        const err = new Error('Configure MikroTik credentials before creating packages')
        err.statusCode = 400
        throw err
    }

    logInfo('Package router profile sync requested', {
        ...tenantRouterContext(req.tenant),
        profile: name,
        speed
    })

    await createHotspotProfile(req.tenant, name, speed)
    await createPppProfile(req.tenant, name, speed)
}

router.get('/', async (req, res) => {
    try {
        const snapshot = await db.realtime.ref(`tenants/${req.tenant.id}/packages`).get()

        const packages = []
        snapshot.forEach((child) => packages.push({ id: child.key, ...child.val() }))

        logInfo('Packages list returned', {
            tenant_id: req.tenant.id,
            count: packages.length,
            package_names: packages.map((pkg) => pkg.name)
        })

        res.json(packages)
    } catch (err) {
        logError('Packages list failed', err, {
            tenant_id: req.tenant?.id
        })
        res.status(500).json({ message: err.message })
    }
})

router.get('/router/profiles', async (req, res) => {
    try {
        if (!hasMikroTikCredentials(req.tenant)) {
            return res.status(400).json({ message: 'Configure MikroTik credentials before viewing router profiles' })
        }

        const profiles = await listPppProfiles(req.tenant)

        res.json(profiles.map((profile) => ({
            id: profile['.id'],
            name: profile.name,
            rate_limit: profile['rate-limit'] || null,
            local_address: profile['local-address'] || null,
            remote_address: profile['remote-address'] || null
        })))
    } catch (err) {
        logError('Router PPP profile list failed', err, {
            tenant_id: req.tenant?.id
        })
        res.status(502).json({ message: `Failed to read MikroTik PPP profiles: ${err.message}` })
    }
})

router.post('/add', async (req, res) => {
    const { name, speed, duration_days, price } = req.body

    if (!name || !speed || !duration_days || !price) {
        return res.status(400).json({ message: 'All package fields are required' })
    }

    try {
        if (await packageNameExists(req.tenant.id, name)) {
            return res.status(409).json({ message: 'A package with this name already exists' })
        }

        await syncRouterProfilesOrFail(req, name, speed)

        const ref = await db.realtime.ref(`tenants/${req.tenant.id}/packages`).push({
                name,
                speed,
                duration_days: Number(duration_days),
                price: Number(price),
                ppp_profile_status: 'synced',
                ppp_profile_synced_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            })

        res.status(201).json({
            success: true,
            message: 'Package and MikroTik hotspot profile created',
            packageId: ref.key
        })
    } catch (err) {
        logError('Package create failed', err, {
            tenant_id: req.tenant?.id,
            profile: name,
            speed
        })
        res.status(err.statusCode || 502).json({
            message: err.statusCode ? err.message : toProfileSyncMessage(err, name)
        })
    }
})

router.patch('/:packageId', async (req, res) => {
    const { name, speed, duration_days, price } = req.body
    const updates = {}

    if (name !== undefined) updates.name = name
    if (speed !== undefined) updates.speed = speed
    if (duration_days !== undefined) updates.duration_days = Number(duration_days)
    if (price !== undefined) updates.price = Number(price)

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No package fields provided' })
    }

    if (updates.name !== undefined && !String(updates.name).trim()) {
        return res.status(400).json({ message: 'Package name is required' })
    }

    if (updates.speed !== undefined && !String(updates.speed).trim()) {
        return res.status(400).json({ message: 'Speed is required' })
    }

    if (updates.duration_days !== undefined && updates.duration_days <= 0) {
        return res.status(400).json({ message: 'Duration must be greater than 0' })
    }

    if (updates.price !== undefined && updates.price <= 0) {
        return res.status(400).json({ message: 'Price must be greater than 0' })
    }

    try {
        const existingSnap = await db.realtime
            .ref(`tenants/${req.tenant.id}/packages/${req.params.packageId}`)
            .get()

        if (!existingSnap.exists()) {
            return res.status(404).json({ message: 'Package not found' })
        }

        const existingPackage = existingSnap.val()
        const profileName = updates.name || existingPackage.name
        const profileSpeed = updates.speed || existingPackage.speed

        if (updates.name && await packageNameExists(req.tenant.id, updates.name, req.params.packageId)) {
            return res.status(409).json({ message: 'A package with this name already exists' })
        }

        await syncRouterProfilesOrFail(req, profileName, profileSpeed)

        await db.realtime
            .ref(`tenants/${req.tenant.id}/packages/${req.params.packageId}`)
            .update({
                ...updates,
                ppp_profile_status: 'synced',
                ppp_profile_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })

        res.json({ success: true, message: 'Package and MikroTik hotspot profile updated' })
    } catch (err) {
        const profileName = updates.name || 'selected package'
        logError('Package update failed', err, {
            tenant_id: req.tenant?.id,
            package_id: req.params.packageId,
            profile: profileName
        })
        res.status(err.statusCode || 502).json({
            message: err.statusCode ? err.message : toProfileSyncMessage(err, profileName)
        })
    }
})

router.post('/:packageId/sync', async (req, res) => {
    try {
        const snapshot = await db.realtime
            .ref(`tenants/${req.tenant.id}/packages/${req.params.packageId}`)
            .get()

        if (!snapshot.exists()) {
            return res.status(404).json({ message: 'Package not found' })
        }

        const pkg = snapshot.val()
        await syncRouterProfilesOrFail(req, pkg.name, pkg.speed)

        await db.realtime
            .ref(`tenants/${req.tenant.id}/packages/${req.params.packageId}`)
            .update({
                ppp_profile_status: 'synced',
                ppp_profile_synced_at: new Date().toISOString(),
                ppp_profile_error: null
            })

        res.json({ success: true, message: 'MikroTik hotspot profile synced' })
    } catch (err) {
        logError('Package router sync failed', err, {
            tenant_id: req.tenant?.id,
            package_id: req.params.packageId
        })
        res.status(err.statusCode || 502).json({
            message: err.statusCode ? err.message : toProfileSyncMessage(err, 'selected package')
        })
    }
})

router.post('/sync-all', async (req, res) => {
    try {
        const snapshot = await db.realtime.ref(`tenants/${req.tenant.id}/packages`).get()
        const packages = []
        snapshot.forEach((child) => packages.push({ id: child.key, ...child.val() }))

        if (packages.length === 0) {
            return res.json({ success: true, message: 'No packages to sync', synced: 0, failed: 0 })
        }

        const results = []

        for (const pkg of packages) {
            try {
                await syncRouterProfilesOrFail(req, pkg.name, pkg.speed)
                await db.realtime
                    .ref(`tenants/${req.tenant.id}/packages/${pkg.id}`)
                    .update({
                        ppp_profile_status: 'synced',
                        ppp_profile_synced_at: new Date().toISOString(),
                        ppp_profile_error: null
                    })
                results.push({ id: pkg.id, name: pkg.name, success: true })
            } catch (err) {
                const message = err.statusCode ? err.message : toProfileSyncMessage(err, pkg.name)
                await db.realtime
                    .ref(`tenants/${req.tenant.id}/packages/${pkg.id}`)
                    .update({
                        ppp_profile_status: 'failed',
                        ppp_profile_error: message,
                        ppp_profile_failed_at: new Date().toISOString()
                    })
                results.push({ id: pkg.id, name: pkg.name, success: false, message })
            }
        }

        const synced = results.filter((item) => item.success).length
        const failed = results.length - synced

        res.json({
            success: failed === 0,
            message: failed === 0
                ? 'All package profiles synced'
                : `${synced} package profiles synced, ${failed} failed`,
            synced,
            failed,
            results
        })
    } catch (err) {
        logError('All package router sync failed', err, {
            tenant_id: req.tenant?.id
        })
        res.status(err.statusCode || 502).json({
            message: err.statusCode ? err.message : toProfileSyncMessage(err, 'packages')
        })
    }
})

router.delete('/:packageId', async (req, res) => {
    try {
        await db.realtime.ref(`tenants/${req.tenant.id}/packages/${req.params.packageId}`).remove()

        res.json({ success: true, message: 'Package deleted' })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

module.exports = router
