const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const SystemSetting = require("../models/SystemSetting");

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
async function dispatchEmail({ to, subject, html, text, replyTo, attachments, headers }) {
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
      if (attachments && attachments.length) mailOptions.attachments = attachments;
      if (headers) mailOptions.headers = headers;

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
      if (attachments && attachments.length) {
        resendPayload.attachments = attachments.map((att) => ({
          filename: att.filename,
          content: att.content || (att.path && fs.existsSync(att.path) ? fs.readFileSync(att.path) : undefined),
        }));
      }
      if (headers) resendPayload.headers = headers;

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
async function sendPasswordResetEmail({ toEmail, resetLink, fullName, expiryMinutes = 5 }) {
  try {
    const setting = await SystemSetting.findOne({ key: "emailResetEnabled" });
    if (setting && setting.value === false) {
      console.warn(`[EMAIL DISPATCH BLOCKED] Password reset email dispatch is disabled by administrator.`);
      return {
        sent: false,
        disabled: true,
        error: "Password reset emails are currently disabled by administrator.",
      };
    }
  } catch (err) {
    console.warn("[mailer] Error checking emailResetEnabled:", err.message);
  }

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
  const subject = `Verification Code: ${otpCode} - Confirm Account Deletion`;

  const logoPath = path.join(__dirname, "../public/images/kimpc-logo-print.png");
  const attachments = [];
  if (fs.existsSync(logoPath)) {
    attachments.push({
      filename: "kimpc-logo.png",
      path: logoPath,
      cid: "kimpc-logo",
    });
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>KIMPC Security Verification</title>
      <style>
        body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; }
        table { border-collapse: collapse; }
      </style>
    </head>
    <body style="margin: 0; padding: 32px 16px; background-color: #f8fafc;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px 32px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);">
        <!-- Authentic Header with Logo -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
          <tr>
            <td style="width: 44px; vertical-align: middle;">
              <img src="cid:kimpc-logo" width="38" height="38" alt="KIMPC Logo" style="display: block; border-radius: 8px; border: 1px solid #e2e8f0; object-fit: contain; background: #ffffff;" />
            </td>
            <td style="vertical-align: middle; padding-left: 12px;">
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.2;">KIMPC Cooperative</div>
              <div style="font-size: 12px; color: #64748b; line-height: 1.3; margin-top: 2px;">Security Verification</div>
            </td>
          </tr>
        </table>

        <h1 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 10px; line-height: 1.3;">
          Confirm Account Deletion
        </h1>
        <p style="font-size: 14px; line-height: 1.55; color: #475569; margin: 0 0 20px;">
          You requested authorization to permanently delete the following account from the KIMPC system:
        </p>

        <!-- Minimalist Target Summary Table -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500; width: 30%;">Target Name</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${targetName || "User"}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500;">Email</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${targetEmail}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; font-weight: 500;">Role</td>
            <td style="padding: 10px 16px; font-size: 13px; color: #0f172a; font-weight: 600;">${String(targetRole || "").toUpperCase()}</td>
          </tr>
        </table>

        <!-- Minimalist Code Box -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 6px;">
            One-Time Verification Code
          </div>
          <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 26px; font-weight: 700; letter-spacing: 8px; color: #0f172a; margin: 6px 0;">
            ${otpCode}
          </div>
          <div style="font-size: 12px; color: #64748b;">
            Expires in 5 minutes.
          </div>
        </div>

        <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0 0 20px;">
          If you did not initiate this deletion request, please immediately sign in to your administrator dashboard and change your password.
        </p>

        <!-- Footer -->
        <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; font-size: 12px; line-height: 1.6; color: #94a3b8; text-align: center;">
          <p style="margin: 0 0 4px; font-weight: 600; color: #64748b;">Kalilangan Irrigators Multi-Purpose Cooperative (KIMPC)</p>
          <p style="margin: 0;">Automated Security Notification • Please do not reply directly to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: `Your KIMPC verification code to confirm deletion of ${targetName} (${targetEmail}) is: ${otpCode}. Expires in 5 minutes.`,
    attachments,
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

/**
 * Send System Developer authorization email for modifying external integrations.
 */
async function sendDeveloperIntegrationAuthEmail({
  toEmail,
  adminEmail,
  adminName,
  actionDescription,
  authorizeUrl,
  denyUrl,
  otpCode,
  expiryMinutes = 15,
}) {
  const subject = `Authorization Request: System Integration Change (${adminName || adminEmail})`;

  const logoPath = path.join(__dirname, "../public/images/kimpc-logo-print.png");
  const attachments = [];
  if (fs.existsSync(logoPath)) {
    attachments.push({
      filename: "kimpc-logo.png",
      path: logoPath,
      cid: "kimpc-logo",
    });
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>KIMPC Security Authorization</title>
      <style>
        body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased; }
        table { border-collapse: collapse; }
        a { color: inherit; }
      </style>
    </head>
    <body style="margin: 0; padding: 32px 16px; background-color: #f8fafc;">
      <!-- Hidden Preheader for authentic inbox preview -->
      <div style="display: none; font-size: 1px; color: #ffffff; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        An administrator has requested dual-control authorization to update external integrations. Valid for ${expiryMinutes} minutes.
      </div>

      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px 32px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);">
        <!-- Authentic Brand Header with Official Logo -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
          <tr>
            <td style="width: 44px; vertical-align: middle;">
              <img src="cid:kimpc-logo" width="38" height="38" alt="KIMPC Logo" style="display: block; border-radius: 8px; border: 1px solid #e2e8f0; object-fit: contain; background: #ffffff;" />
            </td>
            <td style="vertical-align: middle; padding-left: 12px;">
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.2;">KIMPC Cooperative</div>
              <div style="font-size: 12px; color: #64748b; line-height: 1.3; margin-top: 2px;">Security Authorization Gate</div>
            </td>
          </tr>
        </table>

        <!-- Main Title & Professional Intro -->
        <h1 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 10px; line-height: 1.3;">
          Integration Modification Request
        </h1>
        <p style="font-size: 14px; line-height: 1.55; color: #475569; margin: 0 0 20px;">
          An administrator has initiated a dual-control authorization request to update external integration credentials in the KIMPC Admin Portal. Please review the details below:
        </p>

        <!-- Minimalist Request Summary Table -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500; width: 36%;">Administrator</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">
              ${adminName || "System Admin"} <span style="font-size: 12px; color: #64748b; font-weight: 400;">(${adminEmail})</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500;">Action Target</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">
              ${actionDescription || "System Integrations & API Keys"}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 500;">Valid For</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #0f172a; font-weight: 600;">
              ${expiryMinutes} Minutes
            </td>
          </tr>
        </table>

        <!-- Single Primary Action + Discreet Decline Link -->
        <div style="text-align: center; margin: 28px 0 24px;">
          <a href="${authorizeUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #166534; color: #ffffff !important; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
            Authorize Request
          </a>
          <div style="margin-top: 14px;">
            <a href="${denyUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 13px; color: #64748b; text-decoration: underline;">
              Decline this request
            </a>
          </div>
        </div>

        <!-- Clean, Minimalist Verification Code Block -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; margin-top: 24px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 6px;">
            Direct Authorization Code
          </div>
          <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 24px; font-weight: 700; letter-spacing: 6px; color: #0f172a; margin: 4px 0 6px;">
            ${otpCode}
          </div>
          <div style="font-size: 12px; color: #64748b;">
            Provide this 6-digit code to the administrator if approving in person.
          </div>
        </div>

        <!-- Authentic Corporate Cooperative Footer -->
        <div style="border-top: 1px solid #f1f5f9; margin-top: 32px; padding-top: 20px; font-size: 12px; line-height: 1.6; color: #94a3b8; text-align: center;">
          <p style="margin: 0 0 4px; font-weight: 600; color: #64748b;">Kalilangan Irrigators Multi-Purpose Cooperative (KIMPC)</p>
          <p style="margin: 0 0 6px;">Automated Security Notification • Dual-Authorization Protocol</p>
          <p style="margin: 0;">If you did not initiate or expect this request, click decline immediately to protect your system.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
[KIMPC Cooperative] Security Authorization Request

An administrator has requested dual-control authorization to update external integrations:
- Administrator: ${adminName || "System Admin"} (${adminEmail})
- Target: ${actionDescription || "System Integrations & API Keys"}
- Developer Code: ${otpCode}
- Validity: ${expiryMinutes} minutes

Authorize: ${authorizeUrl}
Decline: ${denyUrl}

If you did not expect this request, click decline immediately.
Kalilangan Irrigators Multi-Purpose Cooperative (KIMPC)
  `.trim();

  return dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: textContent,
    attachments,
  });
}

/**
 * Send security alert email when an account is temporarily locked due to multiple failed login attempts.
 */
async function sendAccountLockoutSecurityEmail({
  toEmail,
  fullName,
  role,
  attempts = 5,
  lockoutMinutes = 15,
  ipAddress,
  userAgent,
  resetPasswordUrl,
}) {
  const subject = `Security Alert: Account Temporarily Locked (${fullName || toEmail})`;
  const timeFormatted = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

  const logoPath = path.join(__dirname, "../public/images/kimpc-logo-print.png");
  const attachments = [];
  if (fs.existsSync(logoPath)) {
    attachments.push({
      filename: "kimpc-logo.png",
      path: logoPath,
      cid: "kimpc-logo",
    });
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>KIMPC Security Alert</title>
      <style>
        body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; }
        table { border-collapse: collapse; }
      </style>
    </head>
    <body style="margin: 0; padding: 32px 16px; background-color: #f8fafc;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px 32px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);">
        <!-- Authentic Header with Logo -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
          <tr>
            <td style="width: 44px; vertical-align: middle;">
              <img src="cid:kimpc-logo" width="38" height="38" alt="KIMPC Logo" style="display: block; border-radius: 8px; border: 1px solid #e2e8f0; object-fit: contain; background: #ffffff;" />
            </td>
            <td style="vertical-align: middle; padding-left: 12px;">
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.2;">KIMPC Cooperative</div>
              <div style="font-size: 12px; color: #64748b; line-height: 1.3; margin-top: 2px;">Security Alert</div>
            </td>
          </tr>
        </table>

        <h1 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 10px; line-height: 1.3;">
          Account Temporarily Locked
        </h1>
        <p style="font-size: 14px; line-height: 1.55; color: #475569; margin: 0 0 16px;">
          Hello <strong>${fullName || "Member"}</strong>,
        </p>
        <p style="font-size: 14px; line-height: 1.55; color: #475569; margin: 0 0 20px;">
          We detected <strong>${attempts} consecutive failed sign-in attempts</strong> on your KIMPC account (<strong>${toEmail}</strong>). For your security, account sign-in has been temporarily locked for <strong>${lockoutMinutes} minutes</strong>.
        </p>

        <!-- Details Table -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500; width: 34%;">Role</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${(role || "member").toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500;">Time</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${timeFormatted}</td>
          </tr>
          ${ipAddress ? `
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 500;">IP Address</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${ipAddress}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; font-weight: 500;">Duration</td>
            <td style="padding: 10px 16px; font-size: 13px; color: #0f172a; font-weight: 600;">${lockoutMinutes} Minutes</td>
          </tr>
        </table>

        ${resetPasswordUrl ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetPasswordUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
            Reset Password
          </a>
        </div>
        ` : ""}

        <!-- Footer -->
        <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; margin-top: 24px; font-size: 12px; line-height: 1.6; color: #94a3b8; text-align: center;">
          <p style="margin: 0 0 4px; font-weight: 600; color: #64748b;">Kalilangan Irrigators Multi-Purpose Cooperative (KIMPC)</p>
          <p style="margin: 0;">Automated Security Alert • If this was not you, reset your password immediately.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
[KIMPC Security Alert] Your Account has been Temporarily Locked

Hello ${fullName || "Member"},

We detected ${attempts} consecutive failed sign-in attempts on your account (${toEmail}).
For your security, sign-in is temporarily locked for ${lockoutMinutes} minutes.

Time: ${timeFormatted}
${ipAddress ? `IP Address: ${ipAddress}\n` : ""}
If this was not you, please reset your password immediately:
${resetPasswordUrl || "Please visit the KIMPC portal to reset your password."}

Kalilangan Irrigators Multi-Purpose Cooperative (KIMPC)
  `.trim();

  return dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: textContent,
    attachments,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send a general member notification email (booking updates, reminders, announcements, test alerts).
 */
async function sendMemberNotificationEmail({ toEmail, fullName, title, message, actionUrl, category = "Notification" }) {
  const recipient = String(toEmail || "").trim().toLowerCase();
  if (!recipient) {
    return { sent: false, error: "Recipient email is required." };
  }

  const baseOrigin = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const linkUrl = actionUrl || `${baseOrigin}/member/bookings`;
  const cleanTitle = String(title || "KIMPC Machinery Update").trim();
  const cleanMessage = String(message || "You have a new notification from KIMPC.").trim();
  const safeName = escapeHtml(fullName ? fullName.trim() : "Member");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px 0; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04); }
        .badge { display: inline-block; background: #ecfdf5; color: #166534; font-size: 0.72rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; letter-spacing: 0.03em; text-transform: uppercase; margin-bottom: 12px; }
        h1 { color: #0f172a; font-size: 1.2rem; margin: 0 0 12px; }
        p { font-size: 0.92rem; line-height: 1.6; color: #334155; margin: 0 0 16px; }
        .msg-box { background: #f8fafc; border-left: 4px solid #166534; border-radius: 8px; padding: 14px 16px; margin: 16px 0 22px; color: #1e293b; font-size: 0.9rem; line-height: 1.55; }
        .btn { display: inline-block; background-color: #166534; color: #ffffff !important; font-weight: 600; font-size: 0.88rem; text-decoration: none; padding: 11px 22px; border-radius: 8px; }
        .footer { font-size: 0.76rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 26px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="badge">${escapeHtml(category)}</div>
        <h1>${escapeHtml(cleanTitle)}</h1>
        <p>Hello ${safeName},</p>
        <div class="msg-box">${escapeHtml(cleanMessage)}</div>
        <a href="${escapeHtml(linkUrl)}" class="btn" target="_blank" rel="noopener noreferrer">Open KIMPC Portal</a>
        <div class="footer">
          You received this email because Email Notifications are enabled in your KIMPC Member Settings.
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
[KIMPC] ${cleanTitle}

Hello ${fullName ? fullName.trim() : "Member"},

${cleanMessage}

Open portal: ${linkUrl}
  `.trim();

  return dispatchEmail({
    to: recipient,
    subject: `[KIMPC] ${cleanTitle}`,
    html: htmlContent,
    text: textContent,
  });
}

module.exports = {
  dispatchEmail,
  sendPasswordResetEmail,
  sendPasswordChangedNotificationEmail,
  sendDeleteOtpEmail,
  sendMemberSupportEmail,
  sendDeveloperIntegrationAuthEmail,
  sendAccountLockoutSecurityEmail,
  sendMemberNotificationEmail,
};
