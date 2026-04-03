import { NextResponse } from "next/server";
import { Resend } from "resend";
import { rateLimit, getIp } from "@/lib/rateLimit";

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const resend = new Resend(process.env.RESEND_API_KEY);
const TO_EMAIL = process.env.FEEDBACK_EMAIL;

export async function POST(req) {
  const ip = getIp(req);
  const { allowed } = rateLimit({ key: `feedback:${ip}`, limit: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests. Please wait a minute." }, { status: 429 });
  }

  try {
    const { type, subject, message, contact, wallet } = await req.json();

    if (!type || !subject || !message) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    if (!TO_EMAIL) {
      console.error("FEEDBACK_EMAIL env var is not set");
      return NextResponse.json({ ok: false, error: "Feedback not configured" }, { status: 500 });
    }

    const typeLabel = { bug: "🐛 Bug Report", feedback: "💬 Feedback", suggestion: "💡 Suggestion" }[type] || escHtml(type);
    const safeSubject = escHtml(subject);
    const safeMessage = escHtml(message);
    const safeContact = contact ? escHtml(contact) : null;
    const safeWallet  = wallet  ? escHtml(wallet)  : null;

    await resend.emails.send({
      from: "BaseCast Feedback <feedback@basecast.org>",
      to: TO_EMAIL,
      subject: `[BaseCast] ${subject.slice(0, 80)}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#0E1017;color:#F0F2FF;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#6C63FF,#4F46E5);padding:24px 28px;">
            <h1 style="margin:0;font-size:20px;font-weight:700;">BaseCast ${typeLabel}</h1>
            <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">${new Date().toUTCString()}</p>
          </div>
          <div style="padding:28px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #1E2130;font-size:12px;color:#6B7280;width:120px;">Type</td>
                <td style="padding:10px 0;border-bottom:1px solid #1E2130;font-size:13px;color:#F0F2FF;">${typeLabel}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #1E2130;font-size:12px;color:#6B7280;">Subject</td>
                <td style="padding:10px 0;border-bottom:1px solid #1E2130;font-size:13px;color:#F0F2FF;">${safeSubject}</td>
              </tr>
              ${safeWallet ? `<tr>
                <td style="padding:10px 0;border-bottom:1px solid #1E2130;font-size:12px;color:#6B7280;">Wallet</td>
                <td style="padding:10px 0;border-bottom:1px solid #1E2130;font-size:13px;color:#F0F2FF;font-family:monospace;">${safeWallet}</td>
              </tr>` : ""}
              ${safeContact ? `<tr>
                <td style="padding:10px 0;border-bottom:1px solid #1E2130;font-size:12px;color:#6B7280;">Contact</td>
                <td style="padding:10px 0;border-bottom:1px solid #1E2130;font-size:13px;color:#F0F2FF;">${safeContact}</td>
              </tr>` : ""}
            </table>
            <div style="margin-top:20px;">
              <div style="font-size:12px;color:#6B7280;margin-bottom:8px;">Message</div>
              <div style="background:#080B12;border:1px solid #1E2130;border-radius:8px;padding:16px;font-size:13px;color:#D1D5DB;line-height:1.7;white-space:pre-wrap;">${safeMessage}</div>
            </div>
          </div>
          <div style="padding:16px 28px;border-top:1px solid #1E2130;font-size:11px;color:#4B5563;text-align:center;">
            Sent from BaseCast in-app feedback form
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Feedback email error:", err);
    return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 500 });
  }
}
