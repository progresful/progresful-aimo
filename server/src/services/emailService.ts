import SMTP2GOApi from 'smtp2go-nodejs';

// @ts-ignore
const api = SMTP2GOApi.default(process.env.SMTP2GO_API_KEY);
const isProd = process.env.ENV === 'PROD';
const sender = {
  email: process.env.EMAIL_FROM_EMAIL ?? 'no-reply@example.com',
  name: process.env.EMAIL_FROM_NAME ?? 'Base',
};

const emailService = {
  sendTemplateEmail: async (
    recipient: { email: string; name?: string },
    subject: string,
    templateId: string,
    templateData: Map<string, string>
  ) => {
    const req = api
      .mail()
      .to(recipient)
      .from(sender)
      .subject(subject)
      .template(isProd ? templateId : 'pgftest', templateData);
    const res = await api.client().consume(req);
    return res;
  },
};

export default emailService;
