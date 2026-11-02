const nodemailer = require("nodemailer");

/**
 * Configure email transport.
 * Supports standard SMTP (e.g., Gmail, Outlook, Brevo, SendGrid, Mailtrap).
 */
function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null; // SMTP not configured; fallback to simulation
  }

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

/**
 * Send 6-digit OTP verification email to the administrator.
 */
async function sendDeleteOtpEmail({ toEmail, otpCode, targetName, targetRole, targetEmail }) {
  const transporter = createTransporter();

  // If SMTP is not yet set up in .env, simulate dispatch in console
  if (!transporter) {
    console.log(`\n================================================================`);
    console.log(`[EMAIL DISPATCH - SIMULATED (No SMTP credentials configured)]`);
    console.log(`To: ${toEmail}`);
    console.log(`Subject: [SECURITY] KIMPC Deletion Verification OTP: ${otpCode}`);
    console.log(`Target: ${targetName} (${targetEmail}, Role: ${targetRole})`);
    console.log(`OTP Code: >>> ${otpCode} <<< (Expires in 5 minutes)`);
    console.log(`================================================================\n`);
    return { sent: false, simulated: true, reason: "SMTP_USER and SMTP_PASS are not configured in .env" };
  }

  const fromAddress = process.env.SMTP_FROM || `"KIMPC Security" <${process.env.SMTP_USER}>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f5f7f3; margin: 0; padding: 24px; color: #1d2928; }
        .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #dfe6df; padding: 32px; box-shadow: 0 8px 24px rgba(29, 41, 40, 0.06); }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; border-bottom: 1px solid #edf2ed; padding-bottom: 16px; }
        .logo { background: #0d766e; color: #ffffff; font-weight: 800; font-size: 1.1rem; width: 36px; height: 36px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; }
        .title { font-size: 1.1rem; font-weight: 700; color: #0d766e; margin: 0; }
        .warning-box { background: #fff5f5; border-left: 4px solid #e53e3e; padding: 12px 16px; border-radius: 6px; margin: 18px 0; font-size: 0.88rem; color: #9b2c2c; }
        .otp-box { text-align: center; margin: 28px 0; background: #f0fdf4; border: 2px dashed #0d766e; border-radius: 10px; padding: 20px; }
        .otp-code { font-family: monospace; font-size: 2.2rem; font-weight: 800; letter-spacing: 8px; color: #0d766e; margin: 6px 0; }
        .footer { font-size: 0.75rem; color: #718096; margin-top: 24px; border-top: 1px solid #edf2ed; padding-top: 16px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">K</div>
          <div>
            <p class="title">KIMPC Portal Security</p>
            <small style="color: #64746f;">Kalilangan Irrigators Multi-Purpose Cooperative</small>
          </div>
        </div>

        <h2 style="font-size: 1.3rem; margin-top: 0; color: #1a202c;">Authorize Account Deletion</h2>
        <p style="font-size: 0.92rem; line-height: 1.5; color: #4a5568;">
          You requested authorization to permanently delete the following user account from the KIMPC system:
        </p>

        <div class="warning-box">
          <strong>Target:</strong> ${targetName || "User"}<br>
          <strong>Email:</strong> ${targetEmail}<br>
          <strong>Role:</strong> ${String(targetRole || "").toUpperCase()}
        </div>

        <p style="font-size: 0.9rem; color: #4a5568;">Use the one-time verification code below to authorize this permanent deletion:</p>

        <div class="otp-box">
          <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px; color: #234e52; font-weight: 700;">One-Time Verification Code</div>
          <div class="otp-code">${otpCode}</div>
          <div style="font-size: 0.78rem; color: #4a5568;">Expires in <strong>5 minutes</strong></div>
        </div>

        <p style="font-size: 0.82rem; color: #718096;">
          If you did not initiate this deletion request, please immediately sign in to your administrator dashboard and change your admin password.
        </p>

        <div class="footer">
          This is an automated security notification sent by the KIMPC (Kalilangan Irrigators Multi-Purpose Cooperative) Platform. Please do not reply directly to this email.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `[KIMPC Security] Verification OTP: ${otpCode} - Confirm Account Deletion`,
      text: `Your KIMPC 6-digit verification code to delete ${targetName} (${targetEmail}) is: ${otpCode}. It expires in 5 minutes.`,
      html: htmlContent
    });

    console.log(`[EMAIL DISPATCH SUCCESS] Real email sent to ${toEmail}. Message ID: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL DISPATCH ERROR] Failed to send real email to ${toEmail}:`, error.message);
    return { sent: false, error: error.message, simulated: true };
  }
}

module.exports = {
  sendDeleteOtpEmail
};
