const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const rootServiceAccount = path.join(__dirname, '..', 'serviceAccount.json')
const configServiceAccount = fs.readdirSync(__dirname)
    .find((file) => file.endsWith('.json') && file.includes('firebase-adminsdk'))
const serviceAccountPath = fs.existsSync(rootServiceAccount)
    ? rootServiceAccount
    : path.join(__dirname, configServiceAccount)

if (!fs.existsSync(serviceAccountPath)) {
    throw new Error('Firebase service account JSON not found')
}
const serviceAccount = require(serviceAccountPath)
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
