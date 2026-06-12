const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@aouad.co";

/**
 * Send exhibition booking confirmation email.
 */
async function sendExhibitionConfirmation({ to, name, exhibitionName, day, dayDate, timeSlot }) {
  if (!process.env.SMTP_USER) {
    console.warn("[mailer] SMTP not configured — skipping email to", to);
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .wrap { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: #1a1a2e; padding: 40px 30px; text-align: center; }
    .header h1 { color: #c9a96e; margin: 0; font-size: 28px; letter-spacing: 2px; }
    .header p { color: #ffffffcc; margin: 8px 0 0; font-size: 14px; }
    .body { padding: 30px; }
    .body h2 { color: #1a1a2e; margin: 0 0 16px; }
    .detail { background: #f9f6f0; border-left: 4px solid #c9a96e; padding: 16px 20px; margin: 20px 0; border-radius: 4px; }
    .detail p { margin: 6px 0; color: #333; font-size: 15px; }
    .detail strong { color: #1a1a2e; }
    .footer { background: #1a1a2e; padding: 20px 30px; text-align: center; }
    .footer p { color: #ffffff99; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>AOUAD & CO</h1>
      <p>Exhibition Appointment Confirmation</p>
    </div>
    <div class="body">
      <h2>Dear ${name},</h2>
      <p>Thank you for booking your VIP appointment. Your reservation has been confirmed.</p>
      <div class="detail">
        <p><strong>Exhibition:</strong> ${exhibitionName}</p>
        <p><strong>Date:</strong> ${dayDate} (${day === "day1" ? "Day 1" : "Day 2"})</p>
        <p><strong>Time:</strong> ${timeSlot}</p>
      </div>
      <p>We look forward to welcoming you. If you need to make any changes, please contact us directly.</p>
      <p style="margin-top: 24px;">Warm regards,<br/><strong>Aouad & Co Real Estate</strong></p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Aouad & Co Real Estate. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Aouad & Co" <${FROM}>`,
    to,
    subject: `Your VIP Appointment — ${exhibitionName}`,
    html,
  });
}

module.exports = { sendExhibitionConfirmation };
