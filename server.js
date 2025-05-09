const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const enrolleeApplicantsRoute = require('./routes/enrolleeApplicants');
const pdfRoutes = require('./routes/pdfRoutes');
const paymentRoutes = require('./routes/payments');
const accountRoutes = require('./routes/accountRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const strandRoutes = require('./routes/strandRoutes');
const roleRoutes = require('./routes/rolesRoutes');
const systemLogRoutes = require('./routes/systemLogRoutes');
const exportFile = require('./routes/exportFile');
const announcementRoutes = require('./routes/announcementRoutes');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://juanems-web-frontend.onrender.com', 'https://juanems-user-frontend.vercel.app'],
}));

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Drop email_1 index if exists
mongoose.connection.on('connected', async () => {
    try {
        await mongoose.connection.db.collection('enrolleeapplicants').dropIndex('email_1');
        console.log('Dropped email_1 index');
    } catch (err) {
        if (err.codeName === 'IndexNotFound') {
            console.log('email_1 index does not exist, no need to drop');
        } else {
            console.error('Error dropping email_1 index:', err);
        }
    }
});

// Test database connection
app.get("/api/test-db", async (req, res) => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(col => col.name);
        
        const results = {};
        for (const name of collectionNames) {
            try {
                const sampleData = await mongoose.connection.db.collection(name).find().limit(5).toArray();
                results[name] = sampleData;
            } catch (err) {
                results[name] = { error: err.message };
            }
        }
        
        res.json({
            status: "connected",
            database: mongoose.connection.db.databaseName,
            collections: collectionNames,
            sampleData: results
        });
    } catch (err) {
        res.status(500).json({ 
            status: "error", 
            message: err.message,
            stack: process.env.NODE_ENV === 'production' ? null : err.stack
        });
    }
});

// Start account cleaner
const startAccountCleaner = require('./services/accountCleaner');
startAccountCleaner();

// CAPTCHA verification
const verifyCaptcha = async (token) => {
    const secretKey = process.env.CAPTCHA_SECRET_KEY;
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            secret: secretKey,
            response: token,
        }),
    });
    return await response.json();
};

// Routes
app.use('/api/dropdown', require('./routes/dropdownRoutes'));
app.use('/api/enrollee-applicants', enrolleeApplicantsRoute);
app.use('/api/announcements', announcementRoutes);
app.use('/api', pdfRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/pdf', pdfRoutes);

// Admin Routes
app.use('/api/admin', accountRoutes);
app.use('/api/admin/export', exportFile);
app.use('/api/admin/subjects', subjectRoutes);
app.use('/api/admin/sections', sectionRoutes);
app.use('/api/admin/strands', strandRoutes);
app.use('/api/admin/roles', roleRoutes);
app.use('/api/admin/system-logs', systemLogRoutes);

// Test route
app.get("/api/test", (req, res) => {
    res.json({ message: "Backend is working" });
});

// Payment redirect endpoints (for PayMongo)
app.get('/payment/success', async (req, res) => {
    const { email } = req.query;
    res.redirect(`${process.env.FRONTEND_URL}/scope-exam-fee-payment?email=${encodeURIComponent(email)}&status=success`);
});

app.get('/payment/failed', async (req, res) => {
    const { email } = req.query;
    res.redirect(`${process.env.FRONTEND_URL}/scope-exam-fee-payment?email=${encodeURIComponent(email)}&status=failed`);
});

app.get('/payment/processing', async (req, res) => {
    res.send('Payment is being processed. You will be redirected shortly.');
});

// Start server after DB connection
async function startServer() {
    await connectDB(); // Wait for DB connection
    
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    process.exit(1);
});