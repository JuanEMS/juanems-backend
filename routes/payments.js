const express = require('express');
const router = express.Router();
const EnrolleeApplicant = require('../models/EnrolleeApplicant');
const PaymentHistory = require('../models/PaymentHistory');
const sanitizeString = require('../utils/sanitizeString');
const fs = require('fs');

const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

const generateReferenceNumber = () => {
  return `REF-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
};

router.post('/create-checkout', async (req, res) => {
  try {
    const { email, amount, description = 'Exam Fee Payment' } = req.body;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: 'Active',
    });
    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    // Validate amount for reservation payment
    if (description === 'Reservation Fee Payment' && ![500, 1000].includes(amount)) {
      return res.status(400).json({ error: 'Invalid reservation fee amount. Must be 500 or 1000.' });
    }
    // Validate for exam fee payment
    if (description === 'Exam Fee Payment' && applicant.approvedExamFeeStatus !== 'Required') {
      return res.status(400).json({ error: 'Payment not required for this applicant' });
    }
    if (description === 'Exam Fee Payment' && applicant.approvedExamFeeAmount !== amount) {
      return res.status(400).json({ error: 'Amount does not match approved exam fee' });
    }

    // Check for existing pending payments
    const existingPayment = await PaymentHistory.findOne({
      email: email.toLowerCase(),
      status: 'pending',
      description,
    });
    if (existingPayment) {
      return res.status(400).json({ error: 'A pending payment already exists. Please complete or cancel it.' });
    }

    const applicantName = `${applicant.firstName} ${applicant.middleName ? applicant.middleName + ' ' : ''}${applicant.lastName}`;
    const referenceNumber = generateReferenceNumber();

    const linkData = {
      data: {
        attributes: {
          amount: Math.round(amount * 100),
          currency: 'PHP',
          description: `${description} for ${applicant.applicantID}`,
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
      let errorMessage = 'Failed to create payment link';
      try {
        const errorData = JSON.parse(responseBody);
        errorMessage = errorData.errors.map(err => err.detail).join('; ');
      } catch (e) {
        errorMessage = responseBody || errorMessage;
      }
      throw new Error(`PayMongo error: ${errorMessage}`);
    }

    const link = JSON.parse(responseBody);
    const checkoutUrl = link.data.attributes.checkout_url;
    const linkId = link.data.id;

    // Save payment history with pending status
    const paymentHistory = new PaymentHistory({
      applicantID: applicant.applicantID,
      email: applicant.email,
      applicantName,
      paymentMethod: 'link',
      amount,
      description,
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

router.post('/verify-payment', async (req, res) => {
  try {
    const { email, checkoutId } = req.body;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!sanitizeString(checkoutId)) {
      return res.status(400).json({ error: 'Valid checkout ID is required' });
    }

    // Find payment history
    let paymentHistory = await PaymentHistory.findOne({ checkoutId, email: email.toLowerCase() });
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
      let errorMessage = 'Failed to verify payment';
      try {
        const errorData = JSON.parse(responseBody);
        errorMessage = errorData.errors.map(err => err.detail).join('; ');
      } catch (e) {
        errorMessage = responseBody || errorMessage;
      }
      throw new Error(`PayMongo error: ${errorMessage}`);
    }

    const link = JSON.parse(responseBody);
    const paymentStatus = link.data.attributes.status;

    // Update payment history based on PayMongo status
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
        if (paymentHistory.description === 'Exam Fee Payment') {
          applicant.approvedExamFeeStatus = 'Paid';
          applicant.admissionExamDetailsStatus = 'Complete';
        } else if (paymentHistory.description === 'Reservation Fee Payment') {
          applicant.reservationFeePaymentStepStatus = 'Complete';
          applicant.reservationFeeAmountPaid = paymentHistory.amount;
        }
        await applicant.save();
        console.log('Applicant updated:', applicant.email, paymentHistory.description);
        fs.appendFileSync('payments.log', `Applicant updated: ${applicant.email}, Description: ${paymentHistory.description}\n`);
      } else {
        console.warn('Applicant not found for email:', paymentHistory.email);
        fs.appendFileSync('payments.log', `Warning: Applicant not found for email: ${paymentHistory.email}\n`);
      }
    } else if (paymentStatus === 'unpaid') {
      paymentHistory.status = 'cancelled';
      paymentHistory.updatedAt = Date.now();
    } else if (paymentStatus === 'expired') {
      paymentHistory.status = 'expired';
      paymentHistory.updatedAt = Date.now();
    } else {
      paymentHistory.status = 'failed';
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

router.get('/status/:checkoutId', async (req, res) => {
  try {
    const { checkoutId } = req.params;

    if (!sanitizeString(checkoutId)) {
      return res.status(400).json({ error: 'Valid checkout ID is required' });
    }

    const paymentHistory = await PaymentHistory.findOne({ checkoutId });
    if (!paymentHistory) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

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
      let errorMessage = 'Failed to check payment status';
      try {
        const errorData = JSON.parse(responseBody);
        errorMessage = errorData.errors.map(err => err.detail).join('; ');
      } catch (e) {
        errorMessage = responseBody || errorMessage;
      }
      throw new Error(`PayMongo error: ${errorMessage}`);
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

router.get('/history/:email', async (req, res) => {
  try {
    const { email } = req.params;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const payments = await PaymentHistory.find({ email: email.toLowerCase() }).sort({ createdAt: -1 });

    if (!payments || payments.length === 0) {
      return res.status(404).json({ error: 'No payment history found for this email' });
    }

    res.status(200).json(payments);
  } catch (err) {
    console.error('Error fetching payment history:', err.message, err.stack);
    res.status(500).json({ error: `Failed to fetch payment history: ${err.message}` });
  }
});

module.exports = router;