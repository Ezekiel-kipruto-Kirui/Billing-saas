const fs = require('fs')
const path = require('path')
const { GoogleAuth } = require('google-auth-library')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const rulesPath = path.join(__dirname, '..', 'database.rules.json')
const serviceAccountPath = fs.existsSync(path.join(__dirname, '..', 'serviceAccount.json'))
    ? path.join(__dirname, '..', 'serviceAccount.json')
    : path.join(
        __dirname,
        '..',
        'config',
        fs.readdirSync(path.join(__dirname, '..', 'config'))
            .find((file) => file.endsWith('.json') && file.includes('firebase-adminsdk'))
    )

async function deployRules() {
    if (!process.env.FIREBASE_DATABASE_URL) {
        throw new Error('FIREBASE_DATABASE_URL is missing from .env')
    }

    if (!fs.existsSync(rulesPath)) {
        throw new Error('database.rules.json not found')
    }

    if (!fs.existsSync(serviceAccountPath)) {
        throw new Error('Firebase service account JSON not found')
    }

    const auth = new GoogleAuth({
        keyFile: serviceAccountPath,
        scopes: [
            'https://www.googleapis.com/auth/firebase.database',
            'https://www.googleapis.com/auth/userinfo.email'
        ]
    })
    const client = await auth.getClient()
    const accessToken = await client.getAccessToken()
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
    const databaseUrl = process.env.FIREBASE_DATABASE_URL.replace(/\/$/, '')

    const response = await fetch(`${databaseUrl}/.settings/rules.json`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(rules)
    })

    if (!response.ok) {
        const body = await response.text()
        throw new Error(`Rules deploy failed (${response.status}): ${body}`)
    }

    console.log('Realtime Database rules deployed successfully')
}

deployRules().catch((err) => {
    console.error(err.message)
    process.exit(1)
})
