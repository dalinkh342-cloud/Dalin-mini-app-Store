import { notionClient } from './clients.js';
import { NOTION_TABLES, notionSchema } from './notion.js';

const idPattern = /^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
const token = process.env.NOTION_TOKEN?.trim();
const parent = process.env.NOTION_PARENT_PAGE_ID?.trim();

async function setup() {
  if (!token || !idPattern.test(parent || '')) {
    throw new Error('Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID to a shared Notion page ID');
  }
  const notion = notionClient(token);
  const databases = new Map();
  let cursor;
  do {
    const result = await notion('GET', 'blocks/' + parent + '/children?page_size=100' +
      (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''));
    for (const block of result.results) {
      if (block.type !== 'child_database') continue;
      const title = block.child_database.title;
      if (databases.has(title)) databases.set(title, null);
      else databases.set(title, block.id);
    }
    cursor = result.next_cursor;
  } while (cursor);
  for (const table of Object.values(NOTION_TABLES)) {
    const schema = notionSchema(table);
    if (databases.has(table.name) && !databases.get(table.name)) throw new Error('Duplicate Notion database: ' + table.name);
    const dbId = databases.get(table.name);
    const db = dbId ? await notion('GET', 'databases/' + dbId) : await notion('POST', 'databases', {
      parent: { type: 'page_id', page_id: parent },
      title: [{ type: 'text', text: { content: table.name } }],
      is_inline: true, initial_data_source: { properties: schema },
    });
    if (db.data_sources?.length !== 1) throw new Error('Expected exactly one data source in ' + table.name);
    const source = db.data_sources[0].id;
    const current = await notion('GET', 'data_sources/' + source);
    for (const [column, type] of Object.entries(schema)) {
      if (current.properties?.[column]?.type !== Object.keys(type)[0]) {
        throw new Error('Unexpected Notion column: ' + table.name + ' / ' + column);
      }
    }
    console.log(table.env + '=' + source);
  }
}

await setup().catch(error => { console.error(error.message); process.exitCode = 1; });
