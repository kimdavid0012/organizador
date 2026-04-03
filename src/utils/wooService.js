/**
 * Service to interact with WooCommerce REST API
 */

export const wooService = {
    async fetchOrders(config) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');

        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        const url = `${baseUrl}wp-json/wc/v3/orders?consumer_key=${wooKey}&consumer_secret=${wooSecret}&per_page=20`;

        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error al traer pedidos de WooCommerce');
        }
        return await response.json();
    },

    async fetchTopProducts(config) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');

        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        const url = `${baseUrl}wp-json/wc-analytics/reports/products?orderby=items_sold&order=desc&per_page=5&extended_info=true&consumer_key=${wooKey}&consumer_secret=${wooSecret}`;

        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error al traer analíticas de WooCommerce.');
        }
        return await response.json();
    },

    /**
     * Fetch ALL products analytics (for Página Web section)
     */
    async fetchAllProductsAnalytics(config) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');

        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        const url = `${baseUrl}wp-json/wc-analytics/reports/products?orderby=items_sold&order=desc&per_page=100&extended_info=true&consumer_key=${wooKey}&consumer_secret=${wooSecret}`;

        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error al traer analíticas completas de WooCommerce.');
        }
        return await response.json();
    },

    /**
     * Fetch daily stats for a specific product (for the detail chart view)
     */
    async fetchProductStats(config, productId) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');

        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        // Get last 30 days of daily stats for this product
        const after = new Date();
        after.setDate(after.getDate() - 30);
        const afterStr = after.toISOString().slice(0, 10) + 'T00:00:00';
        const url = `${baseUrl}wp-json/wc-analytics/reports/products/stats?products=${productId}&interval=day&after=${afterStr}&extended_info=true&consumer_key=${wooKey}&consumer_secret=${wooSecret}`;

        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error al traer estadísticas del producto.');
        }
        return await response.json();
    },

    async fetchProducts(config) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');

        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        // Fetch up to 100 products (adjust if they have more, or implement full pagination)
        const url = `${baseUrl}wp-json/wc/v3/products?consumer_key=${wooKey}&consumer_secret=${wooSecret}&per_page=100`;

        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error al traer productos de WooCommerce');
        }
        return await response.json();
    },

    async updateProductStock(config, sku, newStock) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) return;
        if (!sku) return;

        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;

        // 1. Find product by SKU
        const findUrl = `${baseUrl}wp-json/wc/v3/products?sku=${sku}&consumer_key=${wooKey}&consumer_secret=${wooSecret}`;
        const findRes = await fetch(findUrl);
        const products = await findRes.json();

        if (!products || products.length === 0) {
            console.warn(`No se encontró producto con SKU ${sku} en WooCommerce`);
            return;
        }

        const wooId = products[0].id;

        // 2. Update stock
        const updateUrl = `${baseUrl}wp-json/wc/v3/products/${wooId}?consumer_key=${wooKey}&consumer_secret=${wooSecret}`;
        const response = await fetch(updateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                manage_stock: true,
                stock_quantity: newStock
            })
        });

        if (!response.ok) {
            console.error('Error al actualizar stock en WooCommerce');
        }
    },

    /**
     * Fetch customers from WooCommerce
     */
    async fetchCustomers(config) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');

        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        let allCustomers = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `${baseUrl}wp-json/wc/v3/customers?consumer_key=${wooKey}&consumer_secret=${wooSecret}&per_page=100&page=${page}&orderby=registered_date&order=desc`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error al traer clientes de WooCommerce');
            const customers = await response.json();
            allCustomers = [...allCustomers, ...customers];
            hasMore = customers.length === 100;
            page++;
            if (page > 10) break; // safety limit
        }
        return allCustomers;
    }
,
    /**
     * Fetch product categories from WooCommerce
     */
    async fetchCategories(config) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');
        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        const url = `${baseUrl}wp-json/wc/v3/products/categories?consumer_key=${wooKey}&consumer_secret=${wooSecret}&per_page=100`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al traer categorías');
        return await response.json();
    },

    /**
     * Fetch revenue stats (last 30 days, daily intervals)
     */
    async fetchRevenueStats(config) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');
        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        const after = new Date();
        after.setDate(after.getDate() - 30);
        const afterStr = after.toISOString().slice(0, 10) + 'T00:00:00';
        const url = `${baseUrl}wp-json/wc-analytics/reports/revenue/stats?interval=day&after=${afterStr}&consumer_key=${wooKey}&consumer_secret=${wooSecret}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al traer revenue stats');
        return await response.json();
    },

    /**
     * Fetch orders with more detail (last 50, for agent analysis)
     */
    async fetchRecentOrders(config, perPage = 50) {
        const { wooUrl, wooKey, wooSecret } = config.marketing || {};
        if (!wooUrl || !wooKey || !wooSecret) throw new Error('Faltan credenciales de WooCommerce');
        const baseUrl = wooUrl.endsWith('/') ? wooUrl : `${wooUrl}/`;
        const url = `${baseUrl}wp-json/wc/v3/orders?consumer_key=${wooKey}&consumer_secret=${wooSecret}&per_page=${perPage}&orderby=date&order=desc`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al traer pedidos recientes');
        return await response.json();
    }
};
