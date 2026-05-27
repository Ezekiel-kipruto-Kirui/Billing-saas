const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

function loadServiceAccount() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
        if (parsed.private_key) {
            parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
        }
        return parsed
    }

    const rootServiceAccount = path.join(__dirname, '..', 'serviceAccount.json')
    const rootFirebaseServiceAccount = fs.readdirSync(path.join(__dirname, '..'))
        .find((file) => file.endsWith('.json') && file.includes('firebase-adminsdk'))
    const configServiceAccount = fs.readdirSync(__dirname)
        .find((file) => file.endsWith('.json') && file.includes('firebase-adminsdk'))
    const serviceAccountPath = fs.existsSync(rootServiceAccount)
        ? rootServiceAccount
        : rootFirebaseServiceAccount
            ? path.join(__dirname, '..', rootFirebaseServiceAccount)
            : configServiceAccount
            ? path.join(__dirname, configServiceAccount)
            : null

    if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
        throw new Error('Firebase service account JSON not found')
    }

    return require(serviceAccountPath)
}

const serviceAccount = loadServiceAccount()
const databaseURL = (process.env.FIREBASE_DATABASE_URL ||
    (serviceAccount.project_id
        ? `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
        : undefined))
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[,\s/]+$/, '')

if (!databaseURL) {
    throw new Error('FIREBASE_DATABASE_URL is required')
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    ...(databaseURL
        ? { databaseURL }
        : {})
})

const db = {
    realtime: admin.database(),
    admin
}

module.exports = db
