/**
 * Instagram Graph API Service — Organic metrics for @celavieindumentaria
 * Uses Meta Graph API with business_management + instagram_basic + instagram_manage_insights
 * Instagram Business Account ID: 17841419877419584
 */

const IG_ACCOUNT_ID = '17841419877419584';
const GRAPH_API_VERSION = 'v25.0';

async function igFetch(path, token) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}&access_token=${token}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `IG API error ${response.status}`);
  }
  return response.json();
}

export const instagramService = {
  _getToken(config) {
    const t = config.marketing?.metaToken;
    if (!t) throw new Error('Falta Meta Access Token en Configuración');
    return t;
  },

  _getIgId(config) {
    return config.marketing?.instagramAccountId || IG_ACCOUNT_ID;
  },

  /** Fetch basic account info: followers, media count, bio */
  async fetchProfile(config) {
    const token = this._getToken(config);
    const igId = this._getIgId(config);
    const data = await igFetch(`${igId}?fields=username,name,followers_count,follows_count,media_count,biography,profile_picture_url,website`, token);
    return data;
  },

  /** Fetch account insights: reach, impressions, profile views (last 30 days) */
  async fetchAccountInsights(config) {
    const token = this._getToken(config);
    const igId = this._getIgId(config);
    const metrics = 'reach,impressions,profile_views,website_clicks,email_contacts';
    const data = await igFetch(`${igId}/insights?metric=${metrics}&period=day&since=${Math.floor(Date.now()/1000) - 30*86400}&until=${Math.floor(Date.now()/1000)}`, token);
    return data.data || [];
  },

  /** Fetch audience demographics: age/gender, top cities, top countries */
  async fetchAudienceDemographics(config) {
    const token = this._getToken(config);
    const igId = this._getIgId(config);
    const metrics = 'audience_city,audience_country,audience_gender_age';
    try {
      const data = await igFetch(`${igId}/insights?metric=${metrics}&period=lifetime`, token);
      return data.data || [];
    } catch {
      return []; // May fail if account has <100 followers
    }
  },

  /** Fetch recent media (posts/reels) with engagement metrics */
  async fetchRecentMedia(config, limit = 25) {
    const token = this._getToken(config);
    const igId = this._getIgId(config);
    const fields = 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink';
    const data = await igFetch(`${igId}/media?fields=${fields}&limit=${limit}`, token);
    return (data.data || []).map(post => ({
      ...post,
      engagement: (post.like_count || 0) + (post.comments_count || 0),
    }));
  },

  /** Fetch insights for a specific media item */
  async fetchMediaInsights(config, mediaId) {
    const token = this._getToken(config);
    const metrics = 'impressions,reach,engagement,saved';
    try {
      const data = await igFetch(`${mediaId}/insights?metric=${metrics}`, token);
      return data.data || [];
    } catch { return []; }
  },

  /** Fetch top posts by engagement (last 25 posts, sorted) */
  async fetchTopPosts(config, limit = 25) {
    const media = await this.fetchRecentMedia(config, limit);
    return media.sort((a, b) => b.engagement - a.engagement);
  },

  /** Fetch stories insights (only available for 24h after posting) */
  async fetchStories(config) {
    const token = this._getToken(config);
    const igId = this._getIgId(config);
    try {
      const data = await igFetch(`${igId}/stories?fields=id,media_type,timestamp,permalink`, token);
      return data.data || [];
    } catch { return []; }
  },

  /** Calculate engagement rate and best posting times */
  async fetchAnalytics(config) {
    const [profile, media] = await Promise.all([
      this.fetchProfile(config),
      this.fetchRecentMedia(config, 25),
    ]);

    const followers = profile.followers_count || 1;
    const totalEngagement = media.reduce((s, p) => s + p.engagement, 0);
    const avgEngagement = media.length > 0 ? totalEngagement / media.length : 0;
    const engagementRate = ((avgEngagement / followers) * 100).toFixed(2);

    // Best posting times analysis
    const hourCounts = {};
    const dayCounts = {};
    media.forEach(post => {
      const d = new Date(post.timestamp);
      const hour = d.getHours();
      const day = d.toLocaleDateString('es-AR', { weekday: 'long' });
      hourCounts[hour] = (hourCounts[hour] || 0) + post.engagement;
      dayCounts[day] = (dayCounts[day] || 0) + post.engagement;
    });

    const bestHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${h}:00`);
    const bestDays = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);

    // Content type performance
    const typePerformance = {};
    media.forEach(post => {
      const type = post.media_type || 'UNKNOWN';
      if (!typePerformance[type]) typePerformance[type] = { count: 0, totalEngagement: 0 };
      typePerformance[type].count++;
      typePerformance[type].totalEngagement += post.engagement;
    });
    Object.values(typePerformance).forEach(t => { t.avgEngagement = Math.round(t.totalEngagement / t.count); });

    return {
      followers: profile.followers_count,
      following: profile.follows_count,
      mediaCount: profile.media_count,
      engagementRate: parseFloat(engagementRate),
      avgLikes: Math.round(media.reduce((s, p) => s + (p.like_count || 0), 0) / (media.length || 1)),
      avgComments: Math.round(media.reduce((s, p) => s + (p.comments_count || 0), 0) / (media.length || 1)),
      bestPostingHours: bestHours,
      bestPostingDays: bestDays,
      contentTypePerformance: typePerformance,
      topPosts: media.sort((a, b) => b.engagement - a.engagement).slice(0, 5).map(p => ({
        caption: (p.caption || '').substring(0, 80),
        type: p.media_type,
        likes: p.like_count,
        comments: p.comments_count,
        engagement: p.engagement,
        date: new Date(p.timestamp).toLocaleDateString('es-AR'),
        permalink: p.permalink,
      })),
    };
  },

  /** Full Instagram report for agents */
  async fetchFullReport(config) {
    const [analytics, accountInsights, demographics] = await Promise.allSettled([
      this.fetchAnalytics(config),
      this.fetchAccountInsights(config),
      this.fetchAudienceDemographics(config),
    ]);

    return {
      analytics: analytics.status === 'fulfilled' ? analytics.value : null,
      accountInsights: accountInsights.status === 'fulfilled' ? accountInsights.value : null,
      demographics: demographics.status === 'fulfilled' ? demographics.value : null,
    };
  },
};
