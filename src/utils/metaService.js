/**
 * Service to interact with Meta Graph API (Ads Insights, Campaigns, Ad Sets, Ads)
 */

export const metaService = {
    _getAdAccountId(config) {
        const { metaAdAccountId } = config.marketing || {};
        if (!metaAdAccountId) throw new Error('Falta el ID de cuenta publicitaria de Meta');
        return metaAdAccountId.startsWith('act_') ? metaAdAccountId : `act_${metaAdAccountId}`;
    },

    _getToken(config) {
        const { metaToken } = config.marketing || {};
        if (!metaToken) throw new Error('Falta el token de Meta Ads');
        return metaToken;
    },

    async _fetchJson(url, fallbackMessage) {
        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || fallbackMessage);
        }
        return await response.json();
    },

    async _fetchCampaignInsightsByPreset(config, campaignId, datePreset) {
        const token = this._getToken(config);
        const fields = [
            'spend',
            'impressions',
            'clicks',
            'reach',
            'cpc',
            'ctr',
            'cpm',
            'frequency',
            'actions',
            'action_values',
            'purchase_roas'
        ].join(',');

        const url = `https://graph.facebook.com/v19.0/${campaignId}/insights?fields=${fields}&date_preset=${datePreset}&access_token=${token}`;
        const result = await this._fetchJson(url, 'Error al traer insights de campaña');
        return result.data?.[0] || {};
    },

    /**
     * Fetch account-level insights for the last 30 days
     */
    async fetchAdInsights(config) {
        const adAccountId = this._getAdAccountId(config);
        const token = this._getToken(config);

        const url = `https://graph.facebook.com/v19.0/${adAccountId}/insights?fields=spend,impressions,clicks,reach,cpc,ctr,cpp,frequency,actions&date_preset=last_30d&access_token=${token}`;

        const result = await this._fetchJson(url, 'Error al traer datos de Meta Ads');
        return result.data || [];
    },

    /**
     * Fetch all campaigns with their insights
     */
    async fetchCampaigns(config) {
        const adAccountId = this._getAdAccountId(config);
        const token = this._getToken(config);

        const url = `https://graph.facebook.com/v19.0/${adAccountId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(last_30d){spend,impressions,clicks,reach,cpc,ctr,actions}&limit=50&access_token=${token}`;

        const result = await this._fetchJson(url, 'Error al traer campañas de Meta');
        return result.data || [];
    },

    /**
     * Fetch ad sets for a specific campaign
     */
    async fetchAdSets(config, campaignId) {
        const token = this._getToken(config);

        const url = `https://graph.facebook.com/v19.0/${campaignId}/adsets?fields=name,status,daily_budget,lifetime_budget,targeting,insights.date_preset(last_30d){spend,impressions,clicks,reach,cpc,ctr}&limit=50&access_token=${token}`;

        const result = await this._fetchJson(url, 'Error al traer conjuntos de anuncios');
        return result.data || [];
    },

    /**
     * Fetch daily insights breakdown for a campaign (for chart)
     */
    async fetchCampaignDailyInsights(config, campaignId) {
        const token = this._getToken(config);

        const url = `https://graph.facebook.com/v19.0/${campaignId}/insights?fields=spend,impressions,clicks,reach,cpc,ctr&date_preset=last_30d&time_increment=1&access_token=${token}`;

        const result = await this._fetchJson(url, 'Error al traer insights diarios');
        return result.data || [];
    },

    async fetchCampaignReportData(config, campaignId) {
        const [today, last7d, last30d] = await Promise.all([
            this._fetchCampaignInsightsByPreset(config, campaignId, 'today'),
            this._fetchCampaignInsightsByPreset(config, campaignId, 'last_7d'),
            this._fetchCampaignInsightsByPreset(config, campaignId, 'last_30d'),
        ]);

        return { today, last7d, last30d };
    }
};
