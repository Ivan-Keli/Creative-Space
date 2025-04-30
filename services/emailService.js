// C:\Projects\creativespace\services\emailService.js
const nodemailer = require('nodemailer');

// Configure nodemailer with your email service provider details
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail', // e.g., gmail, outlook, etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text email body (optional if html is provided)
 * @param {string} options.html - HTML email body (optional if text is provided)
 * @param {string} options.from - Sender email address (optional, defaults to EMAIL_FROM env variable)
 * @param {Array} options.attachments - Array of attachment objects (optional)
 * @returns {Promise} - Resolves with info about the sent email
 */
const sendEmail = async (options) => {
  const mailOptions = {
    from: options.from || process.env.EMAIL_FROM || '"CreativeSpace" <noreply@creativespace.com>',
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html
  };

  if (options.attachments) {
    mailOptions.attachments = options.attachments;
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Send a ticket confirmation email
 * @param {Object} options - Options
 * @param {string} options.to - Recipient email address
 * @param {string} options.userName - User's name
 * @param {Object} options.event - Event details
 * @param {Array} options.tickets - Array of ticket details
 * @param {Object} options.transaction - Transaction details
 * @returns {Promise} - Resolves with info about the sent email
 */
const sendTicketConfirmationEmail = async (options) => {
  const { to, userName, event, tickets, transaction } = options;

  const ticketListHtml = tickets.map(ticket => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticket.ticketCode}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${event.name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${new Date(event.startDate).toLocaleDateString()} ${event.startTime || 'TBA'}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${event.venue?.name || 'TBA'}</td>
    </tr>
  `).join('');

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3f51b5;">Your Tickets Are Ready!</h2>
      <p>Hello ${userName},</p>
      <p>Thank you for your purchase. Your tickets for <strong>${event.name}</strong> are confirmed.</p>
      
      <div style="background-color: #f7f7f7; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <h3 style="margin-top: 0;">Event Details</h3>
        <p><strong>Event:</strong> ${event.name}</p>
        <p><strong>Date:</strong> ${new Date(event.startDate).toLocaleDateString()}</p>
        <p><strong>Time:</strong> ${event.startTime || 'TBA'}</p>
        <p><strong>Venue:</strong> ${event.venue?.name || 'TBA'}</p>
        <p><strong>Address:</strong> ${event.venue?.address || ''}, ${event.venue?.city || ''}</p>
      </div>
      
      <h3>Your Tickets:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Ticket Code</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Event</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Date & Time</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Venue</th>
          </tr>
        </thead>
        <tbody>
          ${ticketListHtml}
        </tbody>
      </table>
      
      <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 5px;">
        <p style="margin-top: 0;"><strong>Important:</strong> Please bring your ticket codes and a valid ID to the event.</p>
      </div>
      
      <p><strong>Transaction ID:</strong> ${transaction.id}</p>
      <p><strong>Amount:</strong> $${transaction.amount}</p>
      
      <p style="margin-top: 30px; font-size: 0.9em; color: #777;">If you have any questions, please contact us at support@creativespace.com</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Your Tickets for ${event.name}`,
    html: emailHtml
  });
};

module.exports = {
  sendEmail,
  sendTicketConfirmationEmail
};
