import crypto from 'node:crypto';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

const base64Url = (value) => Buffer.from(value)
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const getPrivateKey = () => {
  const key = process.env.GOOGLE_PRIVATE_KEY || process.env.GA4_PRIVATE_KEY || '';
  return key.replace(/\\n/g, '\n');
};

const createJwt = ({ clientEmail, privateKey }) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${unsigned}.${signature}`;
};

const getAccessToken = async ({ clientEmail, privateKey }) => {
  const assertion = createJwt({ clientEmail, privateKey });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'No se pudo autenticar con Google');
  }
  return data.access_token;
};

const runReport = async ({ propertyId, accessToken, body }) => {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'No se pudo leer GA4');
  }
  return data;
};

const metricValue = (row, index) => Number(row?.metricValues?.[index]?.value || 0);

export const handler = async (event) => {
  try {
    const queryPropertyId = event.queryStringParameters?.propertyId || '';
    const propertyId = (queryPropertyId || process.env.GA4_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID || '').replace(/^properties\//, '').trim();
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GA4_CLIENT_EMAIL || '';
    const privateKey = getPrivateKey();

    if (!propertyId || !clientEmail || !privateKey) {
      return json(200, {
        configured: false,
        reason: 'missing_credentials',
        message: 'Falta configurar GA4_PROPERTY_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY en Netlify.'
      });
    }

    const accessToken = await getAccessToken({ clientEmail, privateKey });
    const dateRanges = [{ startDate: '30daysAgo', endDate: 'today' }];

    const [summary, daily, pages] = await Promise.all([
      runReport({
        propertyId,
        accessToken,
        body: {
          dateRanges,
          metrics: [
            { name: 'activeUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'ecommercePurchases' },
            { name: 'totalRevenue' },
            { name: 'engagementRate' }
          ]
        }
      }),
      runReport({
        propertyId,
        accessToken,
        body: {
          dateRanges,
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
          orderBys: [{ dimension: { dimensionName: 'date' } }]
        }
      }),
      runReport({
        propertyId,
        accessToken,
        body: {
          dateRanges,
          dimensions: [{ name: 'pageTitle' }, { name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 8
        }
      })
    ]);

    const summaryRow = summary.rows?.[0];
    return json(200, {
      configured: true,
      propertyId,
      summary: {
        activeUsers: metricValue(summaryRow, 0),
        sessions: metricValue(summaryRow, 1),
        pageViews: metricValue(summaryRow, 2),
        purchases: metricValue(summaryRow, 3),
        revenue: metricValue(summaryRow, 4),
        engagementRate: metricValue(summaryRow, 5)
      },
      daily: (daily.rows || []).map((row) => ({
        date: row.dimensionValues?.[0]?.value || '',
        sessions: metricValue(row, 0),
        activeUsers: metricValue(row, 1),
        pageViews: metricValue(row, 2)
      })),
      pages: (pages.rows || []).map((row) => ({
        title: row.dimensionValues?.[0]?.value || 'Sin titulo',
        path: row.dimensionValues?.[1]?.value || '/',
        pageViews: metricValue(row, 0),
        activeUsers: metricValue(row, 1)
      }))
    });
  } catch (error) {
    return json(200, {
      configured: true,
      error: error.message || 'Error desconocido al leer GA4'
    });
  }
};
