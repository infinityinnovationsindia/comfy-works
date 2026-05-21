
/**
 * WhatsApp notifications via Meta Cloud API.
 * Falls back to console.log if credentials not set.
 *
 * Setup:
 *   WHATSAPP_PHONE_NUMBER_ID=  (from Meta Developer console)
 *   WHATSAPP_ACCESS_TOKEN=     (System User token)
 *
 * Templates (submit these to Meta for approval):
 *   comfy_leave_approval   - to approver
 *   comfy_leave_decision   - to employee
 *   comfy_time_off_approved - to security
 *   comfy_on_duty_approved  - to security
 *   comfy_aaa_alert        - to Kush
 */

const META_API = 'https://graph.facebook.com/v19.0';

export type WATemplate =
  | 'comfy_leave_approval'
  | 'comfy_leave_decision'
  | 'comfy_time_off_approved'
  | 'comfy_on_duty_approved'
  | 'comfy_aaa_alert'
  | 'comfy_escalate_kush';

/**
 * Send a WhatsApp template message.
 * @param to   - phone number with country code, no '+': "919876543210"
 * @param template - template name approved by Meta
 * @param params   - body parameter values in order
 */
export async function sendWhatsApp(
  to: string,
  template: WATemplate,
  params: string[]
): Promise<{ success: boolean; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;

  // Fallback: log to console if not configured
  if (!phoneNumberId || !accessToken) {
    console.log('[WhatsApp FALLBACK]', { to, template, params });
    return { success: true };
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: 'en' },
      components: [{
        type: 'body',
        parameters: params.map(text => ({ type: 'text', text: String(text) })),
      }],
    },
  };

  try {
    const res = await fetch(`${META_API}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[WhatsApp Error]', err);
      return { success: false, error: JSON.stringify(err) };
    }

    return { success: true };
  } catch (e: any) {
    console.error('[WhatsApp Exception]', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Notify leave approver (L1, L2, or L3).
 */
export async function notifyLeaveApprover(params: {
  approverPhone: string;
  employeeName: string;
  leaveType: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  reason: string;
  plBalance: number;
  approveUrl: string;
}) {
  return sendWhatsApp(
    params.approverPhone,
    'comfy_leave_approval',
    [
      params.employeeName,
      params.leaveType,
      params.dateFrom,
      params.dateTo,
      String(params.days),
      params.reason.slice(0, 200),
      String(params.plBalance),
      params.approveUrl,
    ]
  );
}

/**
 * Notify employee of leave decision.
 */
export async function notifyEmployeeDecision(params: {
  employeePhone: string;
  leaveType: string;
  dateFrom: string;
  dateTo: string;
  decision: 'Approved' | 'Rejected';
  comment?: string;
}) {
  return sendWhatsApp(
    params.employeePhone,
    'comfy_leave_decision',
    [
      params.leaveType,
      params.dateFrom,
      params.dateTo,
      params.decision,
      params.comment ?? (params.decision === 'Approved' ? 'Your leave has been sanctioned.' : 'Contact HR for details.'),
    ]
  );
}

/** Alert Kush about AAA */
export async function notifyKushAAA(params: {
  kushPhone: string;
  employeeName: string;
  date: string;
}) {
  return sendWhatsApp(
    params.kushPhone,
    'comfy_aaa_alert',
    [params.employeeName, params.date]
  );
}
