const nodemailer = require("nodemailer");
const { Resend } = require("resend");

/**
 * Configure SMTP email transporter.
 * Supports standard SMTP (e.g., Gmail, Outlook, Brevo, SendGrid, Mailtrap).
 */
function createSmtpTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null; // SMTP not configured; fallback
  }

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/**
 * Generic email delivery dispatcher.
 * Priority:
 * 1. Resend API (if RESEND_API_KEY is configured and EMAIL_PROVIDER !== 'smtp')
 * 2. SMTP / Nodemailer (if SMTP_USER and SMTP_PASS are configured)
 * 3. Safe Console Simulation (if no live email credentials are set)
 */
async function dispatchEmail({ to, subject, html, text, replyTo }) {
  const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
  const defaultFrom =
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    `"KIMPC Security" <onboarding@resend.dev>`;
  const preferredProvider = (process.env.EMAIL_PROVIDER || "").toLowerCase().trim();

  // Helper for SMTP send
  const trySmtp = async () => {
    const smtpTransporter = createSmtpTransporter();
    if (!smtpTransporter) return null;
    try {
      const fromAddress = process.env.SMTP_FROM || `"KIMPC Security" <${process.env.SMTP_USER}>`;
      const mailOptions = {
        from: fromAddress,
        to,
        subject,
        html,
        text,
      };
      if (replyTo) mailOptions.replyTo = replyTo;

      const info = await smtpTransporter.sendMail(mailOptions);
      console.log(`[EMAIL DISPATCH SUCCESS (SMTP)] Real email sent to ${to}. Message ID: ${info.messageId}`);
      return { sent: true, messageId: info.messageId, provider: "smtp" };
    } catch (err) {
      console.error(`[EMAIL DISPATCH ERROR (SMTP)] Failed to send email to ${to}:`, err.message);
      return { sent: false, error: err.message, provider: "smtp" };
    }
  };

  // Helper for Resend send
  const tryResend = async () => {
    if (!resendApiKey) return null;
    try {
      const resend = new Resend(resendApiKey);
      const resendPayload = {
        from: defaultFrom,
        to: [to],
        subject,
        html,
        text,
      };
      if (replyTo) resendPayload.reply_to = replyTo;

      const { data, error } = await resend.emails.send(resendPayload);
      if (error) {
        console.warn(`[EMAIL DISPATCH WARNING (Resend)]:`, error.message || error);
        return { sent: false, error: error.message || String(error), provider: "resend" };
      }
      console.log(`[EMAIL DISPATCH SUCCESS (Resend)] Real email sent to ${to}. ID: ${data?.id}`);
      return { sent: true, id: data?.id, provider: "resend" };
    } catch (err) {
      console.warn(`[EMAIL DISPATCH WARNING (Resend)]:`, err.message);
      return { sent: false, error: err.message, provider: "resend" };
    }
  };

  // If user explicitly prefers SMTP, try SMTP first
  if (preferredProvider === "smtp") {
    const smtpResult = await trySmtp();
    if (smtpResult?.sent) return smtpResult;
    const resendResult = await tryResend();
    if (resendResult?.sent) return resendResult;
  } else {
    // Default: Try Resend first, fall back to SMTP if Resend fails or errors
    if (resendApiKey) {
      const resendResult = await tryResend();
      if (resendResult?.sent) return resendResult;
    }
    const smtpResult = await trySmtp();
    if (smtpResult?.sent) return smtpResult;
  }

  // 3. Simulation mode (no credentials provided or providers rejected)
  console.log(`\n================================================================`);
  console.log(`[EMAIL DISPATCH - LOCAL / SIMULATION NOTICE]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Note: If using Resend free tier (onboarding@resend.dev), Resend restricts recipients to the account owner email.`);
  console.log(`To send to all members, configure Gmail SMTP (SMTP_USER/PASS) or verify a domain in Resend.`);
  console.log(`================================================================\n`);

  return {
    sent: false,
    simulated: true,
    reason: "Email dispatch fell back to local notification.",
  };
}

/**
 * Send password reset link to user.
 */
async function sendPasswordResetEmail({ toEmail, resetLink, fullName, expiryMinutes = 30 }) {
  const name = fullName ? fullName.trim() : "KIMPC Member";
  const subject = "[KIMPC Security] Reset Your Password";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); }
        .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 18px; }
        .logo { background: #166534; color: #ffffff; font-weight: 800; font-size: 1.2rem; width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; }
        .title { font-size: 1.1rem; font-weight: 700; color: #166534; margin: 0; }
        .subtitle { font-size: 0.78rem; color: #64748b; margin: 2px 0 0; }
        .btn-wrap { text-align: center; margin: 28px 0; }
        .btn { display: inline-block; background-color: #166534; color: #ffffff !important; font-size: 0.95rem; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 12px rgba(22, 101, 52, 0.25); }
        .link-alt { word-break: break-all; font-family: monospace; font-size: 0.8rem; background: #f1f5f9; padding: 10px 12px; border-radius: 6px; color: #0f172a; border: 1px solid #e2e8f0; margin-top: 10px; }
        .notice-box { background: #fefce8; border-left: 4px solid #ca8a04; padding: 12px 14px; border-radius: 6px; margin: 20px 0; font-size: 0.84rem; color: #854d0e; }
        .footer { font-size: 0.75rem; color: #94a3b8; margin-top: 28px; border-top: 1px solid #f1f5f9; padding-top: 18px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">K</div>
          <div>
            <p class="title">KIMPC Security Portal</p>
            <p class="subtitle">Kalilangan Irrigators Multi-Purpose Cooperative</p>
          </div>
        </div>

        <h2 style="font-size: 1.3rem; margin: 0 0 12px; color: #0f172a;">Password Reset Request</h2>
        <p style="font-size: 0.92rem; line-height: 1.5; color: #334155;">
          Hello <strong>${name}</strong>,
        </p>
        <p style="font-size: 0.92rem; line-height: 1.5; color: #334155;">
          We received a request to reset the password for your KIMPC account associated with <strong>${toEmail}</strong>.
        </p>

        <div class="btn-wrap">
          <a href="${resetLink}" class="btn" target="_blank" rel="noopener noreferrer">Reset My Password</a>
        </div>

        <div class="notice-box">
          <strong>Important:</strong> This reset link is single-use and will expire in <strong>${expiryMinutes} minutes</strong>.
        </div>

        <p style="font-size: 0.84rem; color: #475569; margin-bottom: 6px;">
          If the button above does not work, copy and paste this link into your browser:
        </p>
        <div class="link-alt">${resetLink}</div>

        <p style="font-size: 0.84rem; color: #64748b; margin-top: 20px; line-height: 1.45;">
          If you did not request this password reset, please ignore this email or contact the cooperative office. Your password will remain completely secure and unchanged.
        </p>

        <div class="footer">
          This is an automated security transmission sent by KIMPC (Kalilangan Irrigators Multi-Purpose Cooperative). Please do not reply directly to this email.
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Hello ${name},

We received a request to reset the password for your KIMPC account (${toEmail}).

To reset your password, visit the following link:
${resetLink}

This link is valid for ${expiryMinutes} minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

--
KIMPC Security Team
Kalilangan Irrigators Multi-Purpose Cooperative
  `.trim();

  return dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: textContent,
  });
}

/**
 * Send notification email that password has been changed.
 */
async function sendPasswordChangedNotificationEmail({ toEmail, fullName }) {
  const name = fullName ? fullName.trim() : "KIMPC Member";
  const subject = "[KIMPC Security] Your Password Has Been Reset Successfully";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); }
        .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 18px; }
        .logo { background: #166534; color: #ffffff; font-weight: 800; font-size: 1.2rem; width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; }
        .title { font-size: 1.1rem; font-weight: 700; color: #166534; margin: 0; }
        .subtitle { font-size: 0.78rem; color: #64748b; margin: 2px 0 0; }
        .success-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #166534; padding: 14px 16px; border-radius: 6px; margin: 20px 0; font-size: 0.88rem; color: #166534; }
        .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; padding: 14px 16px; border-radius: 6px; margin: 20px 0; font-size: 0.84rem; color: #991b1b; }
        .footer { font-size: 0.75rem; color: #94a3b8; margin-top: 28px; border-top: 1px solid #f1f5f9; padding-top: 18px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">K</div>
          <div>
            <p class="title">KIMPC Security Portal</p>
            <p class="subtitle">Kalilangan Irrigators Multi-Purpose Cooperative</p>
          </div>
        </div>

        <h2 style="font-size: 1.3rem; margin: 0 0 12px; color: #0f172a;">Password Reset Confirmation</h2>
        <p style="font-size: 0.92rem; line-height: 1.5; color: #334155;">
          Hello <strong>${name}</strong>,
        </p>

        <div class="success-box">
          <strong>Security Notice:</strong> The password for your KIMPC account (<strong>${toEmail}</strong>) was successfully reset.
        </div>

        <p style="font-size: 0.88rem; line-height: 1.5; color: #475569;">
          All previous active sessions on your account have been automatically signed out as a security precaution. You can now log in using your new password.
        </p>

        <div class="alert-box">
          <strong>Didn't make this change?</strong><br>
          If you did not reset your password, please contact the KIMPC administrator immediately to secure your account.
        </div>

        <div class="footer">
          This is an automated security transmission sent by KIMPC (Kalilangan Irrigators Multi-Purpose Cooperative). Please do not reply directly to this email.
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Hello ${name},

The password for your KIMPC account (${toEmail}) was successfully reset.
All previous active sessions have been automatically signed out.

If you did not authorize this change, please contact the KIMPC cooperative administrator immediately.

--
KIMPC Security Team
Kalilangan Irrigators Multi-Purpose Cooperative
  `.trim();

  return dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: textContent,
  });
}

/**
 * Send 6-digit OTP verification email to the administrator for account deletion.
 */
async function sendDeleteOtpEmail({ toEmail, otpCode, targetName, targetRole, targetEmail }) {
  const subject = `[KIMPC Security] Verification OTP: ${otpCode} - Confirm Account Deletion`;
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

  return dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: `Your KIMPC 6-digit verification code to delete ${targetName} (${targetEmail}) is: ${otpCode}. It expires in 5 minutes.`,
  });
}

/**
 * Send member support inquiry email.
 */
async function sendMemberSupportEmail({ toEmail, fromEmail, fullName, subject, message }) {
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_USER;
  return dispatchEmail({
    to: toEmail || supportEmail,
    subject: `[KIMPC Member Support] ${subject}`,
    text: `Member: ${fullName} (${fromEmail})\n\n${message}`,
    html: `<p><strong>Member:</strong> ${fullName} (${fromEmail})</p><p>${message}</p>`,
    replyTo: fromEmail,
  });
}

module.exports = {
  dispatchEmail,
  sendPasswordResetEmail,
  sendPasswordChangedNotificationEmail,
  sendDeleteOtpEmail,
  sendMemberSupportEmail,
};
