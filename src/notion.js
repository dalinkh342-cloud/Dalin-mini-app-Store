export const NOTION_TABLES = {
  leads: {
    name: 'Dalin Sales Leads', env: 'NOTION_LEADS_SOURCE_ID',
    columns: { 'Company': ['title','company'], 'Product': ['rich_text','product'], 'Source': ['rich_text','source'],
      'Status': ['rich_text','stage'], 'Staff Count': ['number','count'], 'Telegram User ID': ['rich_text','buyer'],
      'Sales Owner': ['rich_text','assigned'], 'HR Telegram ID': ['rich_text','hrId'],
      'Locations': ['number','locations'], 'Shift': ['rich_text','shift'],
      'Company Code': ['rich_text','companyCode'], 'Created': ['date','created'], 'Trial Start': ['date','trialStart'],
      'Trial End': ['date','trialEnd'], 'HR First Use': ['date','hrFirstUse'], 'Paid Through': ['date','paidUntil'],
      'Updated': ['date','updated'], 'Last Action By': ['rich_text','updatedBy'] },
  },
  tasks: {
    name: 'Dalin Sales Follow Up', env: 'NOTION_TASKS_SOURCE_ID',
    columns: { 'Name': ['title','kind'], 'Lead ID': ['rich_text','leadId'], 'Order ID': ['rich_text','orderId'],
      'Product': ['rich_text','product'], 'Status': ['rich_text','status'], 'Details': ['rich_text','detail'],
      'Assigned': ['rich_text','assigned'], 'Created': ['date','created'], 'Updated': ['date','updated'] },
  },
  orders: {
    name: 'Dalin Sales Orders', env: 'NOTION_ORDERS_SOURCE_ID',
    columns: { 'Name': ['title','companyCode'], 'Lead ID': ['rich_text','leadId'], 'Buyer ID': ['rich_text','buyer'],
      'Payment Status': ['rich_text','status'], 'Amount XTR': ['number','amount'],
      'Charge ID': ['rich_text','charge'], 'Created': ['date','created'], 'Updated': ['date','updated'] },
  },
};

export function notionSchema(table) {
  return Object.fromEntries([['External ID', { rich_text: {} }],
    ...Object.entries(table.columns).map(([name, [type]]) => [name, { [type]: {} }])]);
}

function rich(value) {
  return value === undefined || value === null || value === '' ? [] : [
    { type: 'text', text: { content: String(value).slice(0, 1900) } },
  ];
}

function property(type, value) {
  if (type === 'date') return { date: value ? { start: new Date(value).toISOString() } : null };
  if (type === 'number') return { number: value ?? null };
  return { [type]: rich(value) };
}

export function notionProperties(table, record) {
  return { 'External ID': property('rich_text', record.id), ...Object.fromEntries(
    Object.entries(table.columns).map(([name, [type, field]]) => [name, property(type, record[field])]),
  ) };
}

export async function syncNotion(notion, store, sources, { kind, id }) {
  const record = store.get(kind, id);
  if (!record || !sources[kind]) return;
  const source = encodeURIComponent(sources[kind]);
  const key = kind + ':' + id;
  const properties = notionProperties(NOTION_TABLES[kind], record);
  let pageId = store.get('notion_pages', key);
  if (pageId) {
    try {
      await notion('PATCH', 'pages/' + encodeURIComponent(pageId), { properties });
      return;
    } catch (error) {
      if (error.status !== 404) throw error;
      store.forget('notion_pages', key);
    }
  }
  const query = await notion('POST', 'data_sources/' + source + '/query', {
    page_size: 2, filter: { property: 'External ID', rich_text: { equals: id } },
  });
  if (query.results.length > 1) throw new Error('Duplicate Notion External ID ' + key);
  if (query.results.length) {
    pageId = query.results[0].id;
    await notion('PATCH', 'pages/' + encodeURIComponent(pageId), { properties });
  } else {
    const created = await notion('POST', 'pages', {
      parent: { type: 'data_source_id', data_source_id: sources[kind] }, properties,
    });
    pageId = created.id;
  }
  store.rememberNotionPage(key, pageId);
}
