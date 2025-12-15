export interface Env {
  WECHAT_QR_URL?: string;
  ALIPAY_QR_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({
    wechatQR: env.WECHAT_QR_URL || '',
    alipayQR: env.ALIPAY_QR_URL || '',
    price: '5'
  });
};