exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  if (event.httpMethod === 'OPTIONS') return {statusCode:204, headers, body:''};
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      service: 'wellversed-fam-netlify-functions',
      functions: ['health','fam-data'],
      configured: {
        sheetId: !!process.env.GOOGLE_SHEET_ID,
        serviceAccountEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        serviceAccountKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
        oauthClientId: !!(process.env.GOOGLE_CLIENT_ID || '255689281984-2t3k3fe19srh84tnjqk3um3psfda58ie.apps.googleusercontent.com')
      }
    })
  };
};
