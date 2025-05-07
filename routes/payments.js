const express = require('express');
const router = express.Router();
const EnrolleeApplicant = require('../models/EnrolleeApplicant');
const PaymentHistory = require('../models/PaymentHistory');
const sanitizeString = require('../utils/sanitizeString');
const crypto = require('crypto');
const fs = require('fs');

// PayMongo API base URL
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';

// PayMongo Secret Key and Webhook Secret
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

// Helper function to generate a unique reference number
const generateReferenceNumber = () => {
  return `REF-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
};

// POST /api/payments/create-checkout
router.post('/create-checkout', async (req, res) => {
  try {
    const { email, amount } = req.body;

    // Validate inputs
    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Find applicant
    const applicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: 'Active',
    });
    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }
    if (applicant.approvedExamFeeStatus !== 'Required') {
      return res.status(400).json({ error: 'Payment not required for this applicant' });
    }
    if (applicant.approvedExamFeeAmount !== amount) {
      return res.status(400).json({ error: 'Amount does not match approved exam fee' });
    }

    // Generate reference number
    const referenceNumber = generateReferenceNumber();

    // Create PayMongo Link
    const linkData = {
      data: {
        attributes: {
          amount: Math.round(amount * 100), // Convert to centavos
          currency: 'PHP',
          description: `Exam Fee Payment for ${applicant.applicantID}`,
          remarks: referenceNumber,
        },
      },
    };

    console.log('Creating PayMongo link with data:', JSON.stringify(linkData, null, 2));
    fs.appendFileSync('payments.log', `Creating link: ${JSON.stringify(linkData, null, 2)}\n`);

    const response = await fetch(`${PAYMONGO_API_URL}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
      },
      body: JSON.stringify(linkData),
    });

    const responseBody = await response.text();
    console.log('PayMongo response status:', response.status);
    console.log('PayMongo response body:', responseBody);
    fs.appendFileSync('payments.log', `PayMongo response: Status ${response.status}, Body ${responseBody}\n`);

    if (!response.ok) {
      const errorData = JSON.parse(responseBody);
      throw new Error(`PayMongo error: ${JSON.stringify(errorData.errors)}`);
    }

    const link = JSON.parse(responseBody);
    const checkoutUrl = link.data.attributes.checkout_url;
    const linkId = link.data.id;

    // Save payment history
    const paymentHistory = new PaymentHistory({
      applicantID: applicant.applicantID,
      email: applicant.email,
      paymentMethod: 'link',
      amount,
      referenceNumber,
      checkoutId: linkId,
      status: 'pending',
    });
    await paymentHistory.save();

    console.log('Payment history saved:', paymentHistory);
    fs.appendFileSync('payments.log', `Payment history saved: ${JSON.stringify(paymentHistory, null, 2)}\n`);

    res.status(200).json({
      checkoutUrl,
      checkoutId: linkId,
      referenceNumber,
    });
  } catch (err) {
    console.error('Error creating link:', err.message, err.stack);
    fs.appendFileSync('payments.log', `Error creating link: ${err.message}\n`);
    res.status(500).json({ error: `Failed to create link: ${err.message}` });
  }
});

// POST /api/payments/verify-payment
router.post('/verify-payment', async (req, res) => {
  try {
    const { email, checkoutId } = req.body;

    // Validate inputs
    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!sanitizeString(checkoutId)) {
      return res.status(400).json({ error: 'Valid checkout ID is required' });
    }

    // Find payment history
    const paymentHistory = await PaymentHistory.findOne({ checkoutId, email: email.toLowerCase() });
    if (!paymentHistory) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    // Check payment status with PayMongo
    const response = await fetch(`${PAYMONGO_API_URL}/links/${checkoutId}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
      },
    });

    const responseBody = await response.text();
    console.log('PayMongo verify response status:', response.status);
    console.log('PayMongo verify response body:', responseBody);
    fs.appendFileSync('payments.log', `Verify response: Status ${response.status}, Body ${responseBody}\n`);

    if (!response.ok) {
      const errorData = JSON.parse(responseBody);
      throw new Error(`PayMongo error: ${JSON.stringify(errorData.errors)}`);
    }

    const link = JSON.parse(responseBody);
    const paymentStatus = link.data.attributes.status;

    // Update payment history
    if (paymentStatus === 'paid') {
      paymentHistory.status = 'successful';
      paymentHistory.paymentId = link.data.attributes.payments[0]?.id || '';
      paymentHistory.updatedAt = Date.now();

      // Update applicant status
      const applicant = await EnrolleeApplicant.findOne({
        email: email.toLowerCase(),
        status: 'Active',
      });
      if (applicant) {
        applicant.approvedExamFeeStatus = 'Paid';
        applicant.admissionExamDetailsStatus = 'Complete';
        await applicant.save();
        console.log('Applicant updated:', applicant.email, applicant.approvedExamFeeStatus);
        fs.appendFileSync('payments.log', `Applicant updated: ${applicant.email}, Status: Paid\n`);
      }
    } else if (paymentStatus === 'unpaid') {
      paymentHistory.status = 'pending';
      paymentHistory.updatedAt = Date.now();
    }

    await paymentHistory.save();
    console.log('Payment history updated:', paymentHistory);
    fs.appendFileSync('payments.log', `Payment history updated: ${JSON.stringify(paymentHistory, null, 2)}\n`);

    res.status(200).json({
      status: paymentHistory.status,
      referenceNumber: paymentHistory.referenceNumber,
      amount: paymentHistory.amount,
      paymentMethod: paymentHistory.paymentMethod,
    });
  } catch (err) {
    console.error('Error verifying payment:', err.message, err.stack);
    fs.appendFileSync('payments.log', `Error verifying payment: ${err.message}\n`);
    res.status(500).json({ error: `Failed to verify payment: ${err.message}` });
  }
});

// GET /api/payments/status/:checkoutId
router.get('/status/:checkoutId', async (req, res) => {
  try {
    const { checkoutId } = req.params;

    // Validate input
    if (!sanitizeString(checkoutId)) {
      return res.status(400).json({ error: 'Valid checkout ID is required' });
    }

    // Find payment history
    const paymentHistory = await PaymentHistory.findOne({ checkoutId });
    if (!paymentHistory) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    // Check PayMongo status
    const response = await fetch(`${PAYMONGO_API_URL}/links/${checkoutId}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
      },
    });

    const responseBody = await response.text();
    console.log('PayMongo status check response status:', response.status);
    console.log('PayMongo status check response body:', responseBody);
    fs.appendFileSync('payments.log', `Status check response: Status ${response.status}, Body ${responseBody}\n`);

    if (!response.ok) {
      const errorData = JSON.parse(responseBody);
      throw new Error(`PayMongo error: ${JSON.stringify(errorData.errors)}`);
    }

    const link = JSON.parse(responseBody);
    const paymentStatus = link.data.attributes.status;

    res.status(200).json({
      checkoutId,
      status: paymentStatus,
      paymentHistoryStatus: paymentHistory.status,
      referenceNumber: paymentHistory.referenceNumber,
      amount: paymentHistory.amount,
      paymentMethod: paymentHistory.paymentMethod,
    });
  } catch (err) {
    console.error('Error checking payment status:', err.message, err.stack);
    fs.appendFileSync('payments.log', `Error checking payment status: ${err.message}\n`);
    res.status(500).json({ error: `Failed to check payment status: ${err.message}` });
  }
});

// POST /api/payments/webhook
router.post('/webhook', async (req, res) => {
  try {
    // Log raw request body for debugging
    const rawBody = req.body.toString();
    console.log('Raw webhook body:', rawBody);
    fs.appendFileSync('payments.log', `Raw webhook body: ${rawBody}\n`);

    // Verify webhook signature
    const signature = req.headers['paymongo-signature'];
    if (!signature) {
      console.error('Webhook signature missing');
      fs.appendFileSync('payments.log', `Webhook error: Signature missing, Headers: ${JSON.stringify(req.headers)}\n`);
      return res.status(401).json({ error: 'Webhook signature missing' });
    }

    console.log('PayMongo signature header:', signature);
    fs.appendFileSync('payments.log', `PayMongo signature header: ${signature}\n`);

    const [t, sig] = signature.split(',');
    const timestamp = t.split('t=')[1];
    const signatureValue = sig.split('s=')[1];

    console.log('Timestamp:', timestamp, 'Signature:', signatureValue);
    fs.appendFileSync('payments.log', `Timestamp: ${timestamp}, Signature: ${signatureValue}\n`);

    const hmac = crypto
      .createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    console.log('Computed HMAC:', hmac);
    fs.appendFileSync('payments.log', `Computed HMAC: ${hmac}, Webhook Secret: ${PAYMONGO_WEBHOOK_SECRET}\n`);

    if (hmac !== signatureValue) {
      console.error('Invalid webhook signature');
      fs.appendFileSync(
        'payments.log',
        `Webhook error: Invalid signature, Received: ${signatureValue}, Computed: ${hmac}, Timestamp: ${timestamp}, Payload: ${rawBody}\n`
      );
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const data = JSON.parse(rawBody);
    console.log('Received PayMongo webhook:', JSON.stringify(data, null, 2));
    fs.appendFileSync('payments.log', `Webhook received: ${JSON.stringify(data, null, 2)}\n`);

    if (!data || !data.data || !data.data.attributes) {
      fs.appendFileSync('payments.log', 'Webhook error: Invalid payload\n');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    const eventType = data.data.attributes.type;
    const linkId = data.data.attributes.data.id;
    const paymentStatus = data.data.attributes.data.attributes.status;

    if (eventType === 'link.payment.paid') {
      // Find payment history
      const paymentHistory = await PaymentHistory.findOne({ checkoutId: linkId });
      if (!paymentHistory) {
        console.error('Payment history not found for linkId:', linkId);
        fs.appendFileSync('payments.log', `Webhook error: Payment history not found for linkId: ${linkId}\n`);
        return res.status(404).json({ error: 'Payment record not found' });
      }

      // Check if already processed
      if (paymentHistory.status === 'successful') {
        console.log('Payment already processed for linkId:', linkId);
        fs.appendFileSync('payments.log', `Webhook: Payment already processed for linkId: ${linkId}\n`);
        return res.status(200).json({ received: true });
      }

      // Update payment history
      paymentHistory.status = 'successful';
      paymentHistory.paymentId = data.data.attributes.data.attributes.payments[0]?.id || '';
      paymentHistory.updatedAt = Date.now();

      // Update applicant status
      const applicant = await EnrolleeApplicant.findOne({
        email: paymentHistory.email.toLowerCase(),
        status: 'Active',
      });
      if (applicant) {
        applicant.approvedExamFeeStatus = 'Paid';
        applicant.admissionExamDetailsStatus = 'Complete';
        await applicant.save();
        console.log('Applicant updated via webhook:', applicant.email, applicant.approvedExamFeeStatus);
        fs.appendFileSync('payments.log', `Applicant updated via webhook: ${applicant.email}, Status: Paid\n`);
      } else {
        console.warn('Applicant not found for email:', paymentHistory.email);
        fs.appendFileSync('payments.log', `Webhook warning: Applicant not found for email: ${paymentHistory.email}\n`);
      }

      await paymentHistory.save();
      console.log('Payment history updated via webhook:', paymentHistory);
      fs.appendFileSync('payments.log', `Payment successful for ID: ${linkId}\n`);
    } else {
      console.log('Webhook event not handled:', eventType);
      fs.appendFileSync('payments.log', `Webhook event not handled: ${eventType}, Status: ${paymentStatus}\n`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error processing webhook:', err.message, err.stack);
    fs.appendFileSync('payments.log', `Webhook error: ${err.message}\n`);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;