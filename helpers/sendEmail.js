const nodemailer = require('nodemailer');

// OTP Email HTML template
const generateOTPHtml = (otp, purpose = 'Email Verification') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${purpose}</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:16px;border:1px solid #2a2a4a;overflow:hidden;max-width:560px;">
          <tr>
            <td style="background:linear-gradient(135deg,#6c63ff,#a78bfa);padding:32px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">✍️ Blogify</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">${purpose}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 36px;">
              <p style="color:#e2e8f0;font-size:16px;margin:0 0 24px;">Here is your one-time verification code:</p>
              <div style="background:#0f0f23;border:2px solid #6c63ff;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px;">
                <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#a78bfa;font-family:monospace;">${otp}</span>
              </div>
              <p style="color:#94a3b8;font-size:14px;margin:0 0 8px;">⏰ This code expires in <strong style="color:#e2e8f0;">10 minutes</strong>.</p>
              <p style="color:#94a3b8;font-size:14px;margin:0;">🔒 If you didn't request this, please ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#12122a;padding:20px 36px;text-align:center;border-top:1px solid #2a2a4a;">
              <p style="color:#475569;font-size:12px;margin:0;">© 2024 Blogify. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// Send email using Nodemailer
const sendEmail = async (to, subject, html) => {
    // If a Gmail Bridge URL is configured (for Render hosting), use that
    if (process.env.GMAIL_BRIDGE_URL) {
        try {
            const res = await fetch(process.env.GMAIL_BRIDGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to, subject, html }),
            });
            const data = await res.json();
            return data.success === true;
        } catch (err) {
            console.error('Gmail Bridge error:', err.message);
            return false;
        }
    }

    // Otherwise use direct SMTP (nodemailer)
    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        await transporter.sendMail({
            from: `"Blogify" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });

        return true;
    } catch (err) {
        console.error('Nodemailer error:', err.message);
        return false;
    }
};

module.exports = { sendEmail, generateOTPHtml };
