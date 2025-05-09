const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');

const SchoolLogoPath = path.join(__dirname, '../assets/SJDEFILogo.png');

router.post('/generate-waiver-pdf', (req, res) => {
  try {
    const { userData, waivedRequirements, academicYear, dateIssued, dateSigned } = req.body;

    if (!userData || !waivedRequirements || waivedRequirements.length === 0) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    // Create PDF document
    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      info: {
        Title: 'Admission Waiver Form',
        Author: 'San Juan De Dios Educational Foundation, Inc.',
        Creator: 'JuanEMS System',
      },
    });

    const buffers = [];
    doc.on('data', (data) => buffers.push(data));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=waiver.pdf',
        'Content-Length': pdfData.length,
      });
      res.send(pdfData);
    });

    // Document dimensions
    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - marginLeft - marginRight;

    // Format dates in Philippine timezone
    const formattedDateIssued = moment.tz(dateIssued, 'Asia/Manila').format('MMMM D, YYYY');
    const formattedDateSigned = moment.tz(dateSigned, 'Asia/Manila').format('MMMM D, YYYY, h:mm A');
    const currentTime = moment().tz('Asia/Manila').format('MMMM D, YYYY, h:mm A');
    
    // Header with school logo
    const headerHeight = 50;
    doc.rect(0, 0, pageWidth, headerHeight).fill('#00245A');
    doc.rect(0, headerHeight, pageWidth, 3).fill('#C68A00');
    
    const logoSize = 32;
    const logoY = (headerHeight - logoSize) / 2;
    
    if (fs.existsSync(SchoolLogoPath)) {
      doc.image(SchoolLogoPath, marginLeft, logoY, { width: logoSize, height: logoSize });
    }

    const textX = marginLeft + logoSize + 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text('SAN JUAN DE DIOS EDUCATIONAL FOUNDATION, INC.', textX, logoY + 3, {
        width: contentWidth - textX + marginLeft,
      });
    
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#dddddd')
      .text('Where faith and reason are expressed in Charity.', textX, logoY + 18, {
        width: contentWidth - textX + marginLeft,
      });

    // Title
    let y = headerHeight + 20;
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#000000')
      .text('Admission Waiver Form', marginLeft, y, { align: 'center', width: contentWidth });
    y += 30;

    // Academic Year and Dates
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444444')
      .text(`Academic Year: ${academicYear}`, marginLeft, y, { width: contentWidth });
    y += 12;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Generated on: ${currentTime}`, marginLeft, y, { width: contentWidth });
    y += 20;

    // Letter Content
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('To Whom It May Concern,', marginLeft, y, { width: contentWidth });
    y += 15;
    
    const requestText = 'May I request from your office to allow me to continue my admission process even I lack the following credentials listed below due to reason that:';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(requestText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(requestText, { width: contentWidth }) + 8;

    // Reason
    const reason = waivedRequirements[0].waiverDetails.reason;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(reason, marginLeft + 12, y, { width: contentWidth - 12 });
    y += doc.heightOfString(reason, { width: contentWidth - 12 }) + 8;

    // Requirements List
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('List of Waived Requirements:', marginLeft, y, { width: contentWidth });
    y += 12;
    
    waivedRequirements.forEach((req, index) => {
      const reqText = `${index + 1}. ${req.name}`;
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(reqText, marginLeft + 12, y, { width: contentWidth - 12 });
      y += doc.heightOfString(reqText, { width: contentWidth - 12 }) + 4;
    });

    // Promise Statement
    y += 8;
    const promiseDate = moment.tz(waivedRequirements[0].waiverDetails.promiseDate, 'Asia/Manila').format('MMMM D, YYYY');
    const promiseText = `I promise to submit my credentials on or before ${promiseDate}.`;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(promiseText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(promiseText, { width: contentWidth }) + 8;

    const consequenceText = 'I understand that failure to submit my credentials on the said date will automatically forfeit my admission in San Juan De Dios Educational Foundation, Inc. without any refund.';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(consequenceText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(consequenceText, { width: contentWidth }) + 15;

    // Signature Section
    const maxContentY = pageHeight - marginLeft - 80;
    if (y + 80 > maxContentY) {
      doc.addPage();
      y = marginLeft;
    }
    
    const userName = `${userData.firstName} ${userData.lastName}`.toUpperCase();
    
    // Name and Date/Time
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(userName, marginLeft, y, { width: contentWidth / 2, align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(formattedDateSigned, marginLeft + contentWidth / 2, y, {
        width: contentWidth / 2,
        align: 'right',
      });
    y += 18;

    // Signature Lines
    doc
      .moveTo(marginLeft, y)
      .lineTo(marginLeft + 180, y)
      .lineWidth(0.5)
      .strokeColor('#444444')
      .stroke();
    doc
      .moveTo(marginLeft + contentWidth / 1.5, y)
      .lineTo(marginLeft + contentWidth / 1.5 + 180, y)
      .lineWidth(0.5)
      .strokeColor('#444444')
      .stroke();
    y += 8;

    // Labels
    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Signature over Printed Name', marginLeft, y, { width: contentWidth / 2, align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Date and Time Signed', marginLeft + contentWidth / 2, y, {
        width: contentWidth / 2,
        align: 'right',
      });

    // Footer
    y = pageHeight - marginLeft - 20;
    doc
      .moveTo(marginLeft, y - 8)
      .lineTo(pageWidth - marginRight, y - 8)
      .lineWidth(0.5)
      .strokeColor('#C68A00')
      .stroke();
    
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#444444')
      .text('Page 1 of 1', marginLeft, y, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });
    
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#990000')
      .text('San Juan De Dios Educational Foundation, Inc. © 2025', marginLeft, y + 10, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

router.post('/generate-exam-permit', (req, res) => {
  try {
    const { userData, examDetails, paymentDetails } = req.body;

    // Validate request body
    if (!userData || !examDetails) {
      return res.status(400).json({ error: 'Missing required data: userData and examDetails are required' });
    }
    if (!userData.firstName || !userData.lastName || !userData.applicantID) {
      return res.status(400).json({ error: 'Missing required userData fields: firstName, lastName, applicantID' });
    }
    if (!examDetails.approvedExamDate || !examDetails.approvedExamTime || !examDetails.approvedExamFeeStatus) {
      return res.status(400).json({ error: 'Missing required examDetails fields: approvedExamDate, approvedExamTime, approvedExamFeeStatus' });
    }
    if (examDetails.approvedExamFeeStatus === 'Paid' && (!paymentDetails || !paymentDetails.referenceNumber || !paymentDetails.amount)) {
      return res.status(400).json({ error: 'Missing required paymentDetails fields for Paid status: referenceNumber, amount' });
    }

    // Initialize PDF document
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: 'Admission Exam Permit',
        Author: 'San Juan De Dios Educational Foundation, Inc.',
        Creator: 'JuanEMS System',
      },
    });

    // Set response headers
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Admission_Exam_Permit_${userData.applicantID || 'unknown'}.pdf`,
    });

    // Pipe PDF directly to response
    doc.pipe(res);

    // Document dimensions
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = doc.page.margins.left;
    const contentWidth = pageWidth - 2 * margin;

    // Safe date parsing
    const currentTime = moment().tz('Asia/Manila').format('MMMM D, YYYY, h:mm A');
    const examDate = examDetails.approvedExamDate && moment(examDetails.approvedExamDate).isValid()
      ? moment(examDetails.approvedExamDate).tz('Asia/Manila').format('MMMM D, YYYY')
      : 'N/A';
    const examTime = examDetails.approvedExamTime || 'N/A';
    const paymentDate = paymentDetails?.createdAt && moment(paymentDetails.createdAt).isValid()
      ? moment(paymentDetails.createdAt).tz('Asia/Manila').format('MMMM D, YYYY, h:mm A')
      : 'N/A';

    // Header
    doc.fillColor('#00245A').rect(0, 0, pageWidth, 80).fill();
    if (fs.existsSync(SchoolLogoPath)) {
      try {
        doc.image(SchoolLogoPath, margin, 20, { width: 50, height: 50 });
      } catch (imgError) {
        console.error('Error loading logo:', imgError.message);
      }
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('white')
      .text('San Juan De Dios Educational Foundation, Inc.', margin + 60, 25, { width: contentWidth - 60 });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#DDDDDD')
      .text('Where faith and reason are expressed in Charity.', margin + 60, 45, { width: contentWidth - 60 });

    // Title
    let y = 100;
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('black')
      .text('Admission Exam Permit', margin, y, { align: 'center' });
    y += 30;

    // Generated Date
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444444')
      .text(`Generated on: ${currentTime}`, margin, y, { align: 'right', width: contentWidth });
    y += 20;

    // Applicant Information
    doc.font('Helvetica-Bold').fontSize(12).text('Applicant Information', margin, y);
    y += 15;
    const fullName = `${userData.firstName} ${userData.middleName ? userData.middleName + ' ' : ''}${userData.lastName}`;
    doc.font('Helvetica').fontSize(10).text(`Name: ${fullName}`, margin, y);
    y += 12;
    doc.font('Helvetica').fontSize(10).text(`Applicant ID: ${userData.applicantID || 'N/A'}`, margin, y);
    y += 12;
    doc.font('Helvetica').fontSize(10).text(`Academic Year: ${examDetails.academicYear || '2025-2026'}`, margin, y);
    y += 20;

    // Exam Details
    doc.font('Helvetica-Bold').fontSize(12).text('Exam Details', margin, y);
    y += 15;
    doc.font('Helvetica').fontSize(10).text(`Date: ${examDate}`, margin, y);
    y += 12;
    doc.font('Helvetica').fontSize(10).text(`Time: ${examTime}`, margin, y);
    y += 12;
    doc.font('Helvetica').fontSize(10).text(`Room: ${examDetails.approvedExamRoom || 'N/A'}`, margin, y);
    y += 12;
    doc.font('Helvetica').fontSize(10).text(`Exam Fee Status: ${examDetails.approvedExamFeeStatus || 'N/A'}`, margin, y);
    y += 12;
    doc.font('Helvetica').fontSize(10).text(
      `Exam Fee Amount: ${examDetails.approvedExamFeeAmount != null ? `₱${examDetails.approvedExamFeeAmount.toFixed(2)}` : 'N/A'}`,
      margin,
      y
    );
    y += 20;

    // Payment Details (if applicable)
    if (examDetails.approvedExamFeeStatus === 'Paid' && paymentDetails) {
      doc.font('Helvetica-Bold').fontSize(12).text('Payment Details', margin, y);
      y += 15;
      doc.font('Helvetica').fontSize(10).text(`Reference Number: ${paymentDetails.referenceNumber || 'N/A'}`, margin, y);
      y += 12;
      doc.font('Helvetica').fontSize(10).text(
        `Payment Method: ${paymentDetails.paymentMethod ? paymentDetails.paymentMethod.charAt(0).toUpperCase() + paymentDetails.paymentMethod.slice(1) : 'N/A'}`,
        margin,
        y
      );
      y += 12;
      doc.font('Helvetica').fontSize(10).text(
        `Amount Paid: ${paymentDetails.amount != null ? `₱${paymentDetails.amount.toFixed(2)}` : 'N/A'}`,
        margin,
        y
      );
      y += 12;
      doc.font('Helvetica').fontSize(10).text(`Payment Date: ${paymentDate || 'N/A'}`, margin, y);
      y += 12;
      doc.font('Helvetica').fontSize(10).text(
        `Status: ${paymentDetails.status ? paymentDetails.status.charAt(0).toUpperCase() + paymentDetails.status.slice(1) : 'N/A'}`,
        margin,
        y
      );
      y += 20;
    }

    // Instructions
    doc.font('Helvetica-Bold').fontSize(12).text('Instructions', margin, y);
    y += 15;
    const instructions = [
      '1. Bring this permit on the day of the exam.',
      '2. Arrive at least 30 minutes before the scheduled time.',
      '3. Present a valid ID along with this permit.',
      '4. No permit, no exam policy is strictly enforced.',
      '5. Contact the Admissions Office for any concerns.',
    ];
    instructions.forEach((instruction) => {
      doc.font('Helvetica').fontSize(10).text(instruction, margin, y, { width: contentWidth });
      y += 15;
    });

    // Footer
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#990000')
      .text(
        'San Juan De Dios Educational Foundation, Inc. © 2025',
        margin,
        pageHeight - 30,
        { align: 'center', width: contentWidth }
      );

    doc.end();
  } catch (error) {
    console.error('Error generating exam permit PDF:', error.message, error.stack);
    res.status(500).json({ error: `Failed to generate exam permit PDF: ${error.message}` });
  }
});

module.exports = router;