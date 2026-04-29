#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GlpiClient } from './glpi-client.js';

const GLPI_BASE_URL = process.env.GLPI_BASE_URL ?? 'http://localhost:8080/api.php/v1';
const GLPI_APP_TOKEN = process.env.GLPI_APP_TOKEN;
const GLPI_USER_TOKEN = process.env.GLPI_USER_TOKEN;
const GLPI_USERNAME = process.env.GLPI_USERNAME;
const GLPI_PASSWORD = process.env.GLPI_PASSWORD;

const client = new GlpiClient({
  baseUrl: GLPI_BASE_URL,
  appToken: GLPI_APP_TOKEN,
});

const server = new Server(
  { name: 'mcp-server-glpi', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ─── Tool Schemas ─────────────────────────────────────────────────────────────

const InitSessionSchema = z.object({
  user_token: z.string().optional().describe('User API token (preferred over username/password)'),
  username: z.string().optional().describe('GLPI username'),
  password: z.string().optional().describe('GLPI password'),
});

const ItemtypeIdSchema = z.object({
  itemtype: z.string().describe('GLPI item type (e.g. Ticket, Computer, User, Group, Entity, Problem, Change, Software, NetworkEquipment, Printer, Monitor, Phone, Peripheral, Contract, Document, KnowbaseItem, Location, Manufacturer, ITILCategory)'),
  id: z.number().int().describe('Item ID'),
});

const GetItemSchema = ItemtypeIdSchema.extend({
  expand_dropdowns: z.boolean().optional().describe('Show dropdown name instead of ID'),
  with_devices: z.boolean().optional().describe('Include devices (for Computer)'),
  with_disks: z.boolean().optional().describe('Include disks (for Computer)'),
  with_softwares: z.boolean().optional().describe('Include software (for Computer)'),
  with_connections: z.boolean().optional().describe('Include connections (for Computer)'),
  with_networkports: z.boolean().optional().describe('Include network ports'),
  with_infocoms: z.boolean().optional().describe('Include financial info'),
  with_contracts: z.boolean().optional().describe('Include contracts'),
  with_documents: z.boolean().optional().describe('Include documents'),
  with_tickets: z.boolean().optional().describe('Include tickets'),
  with_problems: z.boolean().optional().describe('Include problems'),
  with_changes: z.boolean().optional().describe('Include changes'),
  with_notes: z.boolean().optional().describe('Include notes'),
  with_logs: z.boolean().optional().describe('Include logs'),
});

const ListItemsSchema = z.object({
  itemtype: z.string().describe('GLPI item type'),
  expand_dropdowns: z.boolean().optional().describe('Show dropdown names instead of IDs'),
  only_id: z.boolean().optional().describe('Return only IDs'),
  range: z.string().optional().describe('Range of items, e.g. "0-49" (default: 0-49)'),
  sort: z.string().optional().describe('Field name to sort by'),
  order: z.enum(['ASC', 'DESC']).optional().describe('Sort direction'),
  is_deleted: z.boolean().optional().describe('Return only deleted items'),
  searchText: z.record(z.string()).optional().describe('Filter by field values, e.g. {"name": "server"}'),
});

const CreateItemSchema = z.object({
  itemtype: z.string().describe('GLPI item type'),
  input: z.union([
    z.record(z.unknown()),
    z.array(z.record(z.unknown())),
  ]).describe('Item data to create (single object or array for bulk creation)'),
});

const UpdateItemSchema = ItemtypeIdSchema.extend({
  input: z.record(z.unknown()).describe('Fields to update'),
});

const UpdateItemsSchema = z.object({
  itemtype: z.string().describe('GLPI item type'),
  input: z.array(z.record(z.unknown())).describe('Array of objects with "id" field and fields to update'),
});

const DeleteItemSchema = ItemtypeIdSchema.extend({
  force_purge: z.boolean().optional().describe('Permanently delete instead of moving to trash'),
  history: z.boolean().optional().describe('Record deletion in history (default: true)'),
});

const DeleteItemsSchema = z.object({
  itemtype: z.string().describe('GLPI item type'),
  ids: z.array(z.number().int()).describe('Array of item IDs to delete'),
  force_purge: z.boolean().optional().describe('Permanently delete instead of moving to trash'),
  history: z.boolean().optional().describe('Record deletion in history'),
});

const GetSubItemsSchema = z.object({
  itemtype: z.string().describe('Parent item type'),
  id: z.number().int().describe('Parent item ID'),
  sub_itemtype: z.string().describe('Sub-item type (e.g. ITILFollowup, TicketTask, Document_Item, KnowbaseItem_Item)'),
  expand_dropdowns: z.boolean().optional(),
  range: z.string().optional().describe('Range e.g. "0-49"'),
  sort: z.string().optional(),
  order: z.enum(['ASC', 'DESC']).optional(),
});

const SearchSchema = z.object({
  itemtype: z.string().describe('Item type to search (use "AllAssets" for all asset types)'),
  criteria: z.array(z.object({
    link: z.enum(['AND', 'OR', 'AND NOT', 'OR NOT']).optional(),
    field: z.number().int().describe('Search option ID (use glpi_list_search_options to get IDs)'),
    searchtype: z.enum(['contains', 'equals', 'notequals', 'lessthan', 'morethan', 'under', 'notunder']),
    value: z.string(),
  })).optional().describe('Search criteria'),
  sort: z.number().int().optional().describe('Search option ID to sort by'),
  order: z.enum(['ASC', 'DESC']).optional(),
  range: z.string().optional().describe('Range e.g. "0-49"'),
  forcedisplay: z.array(z.number().int()).optional().describe('Force display of these search option IDs'),
  giveItems: z.boolean().optional().describe('Return full item data (default: false)'),
});

const ChangeProfileSchema = z.object({
  profiles_id: z.number().int().describe('Profile ID to activate'),
});

const ChangeEntitiesSchema = z.object({
  entities_id: z.union([z.number().int(), z.literal('all')]).describe('Entity ID or "all"'),
  is_recursive: z.boolean().optional().describe('Include sub-entities'),
});

const ListSearchOptionsSchema = z.object({
  itemtype: z.string().describe('Item type to get search options for'),
});

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'glpi_init_session',
    description: 'Initialize a GLPI session. Must be called before any other GLPI tool. Uses env vars GLPI_USER_TOKEN or GLPI_USERNAME/GLPI_PASSWORD if credentials not provided.',
    inputSchema: zodToJsonSchema(InitSessionSchema),
  },
  {
    name: 'glpi_kill_session',
    description: 'Terminate the current GLPI session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'glpi_get_my_profiles',
    description: 'Get all profiles the current user has access to.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'glpi_get_active_profile',
    description: 'Get the currently active profile.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'glpi_change_active_profile',
    description: 'Switch the active user profile.',
    inputSchema: zodToJsonSchema(ChangeProfileSchema),
  },
  {
    name: 'glpi_get_my_entities',
    description: 'Get all entities the current user has access to.',
    inputSchema: zodToJsonSchema(z.object({ is_recursive: z.boolean().optional() })),
  },
  {
    name: 'glpi_get_active_entities',
    description: 'Get the currently active entities.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'glpi_change_active_entities',
    description: 'Switch the active entity.',
    inputSchema: zodToJsonSchema(ChangeEntitiesSchema),
  },
  {
    name: 'glpi_get_full_session',
    description: 'Get all session information including user details, profile, and entities.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'glpi_get_glpi_config',
    description: 'Get global GLPI configuration.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'glpi_get_item',
    description: 'Get a single GLPI item by type and ID.',
    inputSchema: zodToJsonSchema(GetItemSchema),
  },
  {
    name: 'glpi_list_items',
    description: 'List items of a given type with optional filtering and pagination. Returns up to 50 items by default.',
    inputSchema: zodToJsonSchema(ListItemsSchema),
  },
  {
    name: 'glpi_create_item',
    description: 'Create one or multiple GLPI items.',
    inputSchema: zodToJsonSchema(CreateItemSchema),
  },
  {
    name: 'glpi_update_item',
    description: 'Update a single GLPI item.',
    inputSchema: zodToJsonSchema(UpdateItemSchema),
  },
  {
    name: 'glpi_update_items',
    description: 'Update multiple GLPI items in bulk. Each object in the input array must have an "id" field.',
    inputSchema: zodToJsonSchema(UpdateItemsSchema),
  },
  {
    name: 'glpi_delete_item',
    description: 'Delete (trash) or purge a single GLPI item.',
    inputSchema: zodToJsonSchema(DeleteItemSchema),
  },
  {
    name: 'glpi_delete_items',
    description: 'Delete multiple GLPI items by ID.',
    inputSchema: zodToJsonSchema(DeleteItemsSchema),
  },
  {
    name: 'glpi_get_sub_items',
    description: 'Get sub-items of a GLPI item (e.g. followups of a Ticket, tasks, documents).',
    inputSchema: zodToJsonSchema(GetSubItemsSchema),
  },
  {
    name: 'glpi_search',
    description: 'Search GLPI items using advanced criteria. Use glpi_list_search_options first to discover available field IDs.',
    inputSchema: zodToJsonSchema(SearchSchema),
  },
  {
    name: 'glpi_list_search_options',
    description: 'List available search option IDs for a given item type. Use this before glpi_search to know which field IDs to use.',
    inputSchema: zodToJsonSchema(ListSearchOptionsSchema),
  },
];

// ─── Minimal zod → JSON Schema converter ──────────────────────────────────────

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    const result: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) result['required'] = required;
    return result;
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodString) {
    const s: Record<string, unknown> = { type: 'string' };
    if ((schema as z.ZodString).description) s['description'] = (schema as z.ZodString).description;
    return s;
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options };
  }

  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema.element) };
  }

  if (schema instanceof z.ZodUnion) {
    return { oneOf: (schema.options as z.ZodTypeAny[]).map(zodToJsonSchema) };
  }

  if (schema instanceof z.ZodRecord) {
    return { type: 'object', additionalProperties: zodToJsonSchema((schema as z.ZodRecord<z.ZodString, z.ZodTypeAny>).valueSchema) };
  }

  if (schema instanceof z.ZodLiteral) {
    return { type: typeof schema.value, const: schema.value };
  }

  if (schema instanceof z.ZodUnknown) {
    return {};
  }

  return {};
}

// ─── Request Handlers ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Auto-init session from env vars if no session exists
    if (name !== 'glpi_init_session' && !client.hasSession()) {
      if (GLPI_USER_TOKEN) {
        await client.initSession({ userToken: GLPI_USER_TOKEN });
      } else if (GLPI_USERNAME && GLPI_PASSWORD) {
        await client.initSession({ username: GLPI_USERNAME, password: GLPI_PASSWORD });
      } else {
        return {
          content: [{
            type: 'text',
            text: 'No active GLPI session. Call glpi_init_session first or set GLPI_USER_TOKEN / GLPI_USERNAME+GLPI_PASSWORD environment variables.',
          }],
          isError: true,
        };
      }
    }

    let result: unknown;

    switch (name) {
      case 'glpi_init_session': {
        const parsed = InitSessionSchema.parse(args);
        result = await client.initSession({
          userToken: parsed.user_token ?? GLPI_USER_TOKEN,
          username: parsed.username ?? GLPI_USERNAME,
          password: parsed.password ?? GLPI_PASSWORD,
        });
        break;
      }

      case 'glpi_kill_session':
        await client.killSession();
        result = { message: 'Session terminated successfully' };
        break;

      case 'glpi_get_my_profiles':
        result = await client.getMyProfiles();
        break;

      case 'glpi_get_active_profile':
        result = await client.getActiveProfile();
        break;

      case 'glpi_change_active_profile': {
        const parsed = ChangeProfileSchema.parse(args);
        result = await client.changeActiveProfile(parsed.profiles_id);
        break;
      }

      case 'glpi_get_my_entities': {
        const parsed = z.object({ is_recursive: z.boolean().optional() }).parse(args);
        result = await client.getMyEntities(parsed.is_recursive);
        break;
      }

      case 'glpi_get_active_entities':
        result = await client.getActiveEntities();
        break;

      case 'glpi_change_active_entities': {
        const parsed = ChangeEntitiesSchema.parse(args);
        result = await client.changeActiveEntities(parsed.entities_id, parsed.is_recursive);
        break;
      }

      case 'glpi_get_full_session':
        result = await client.getFullSession();
        break;

      case 'glpi_get_glpi_config':
        result = await client.getGlpiConfig();
        break;

      case 'glpi_get_item': {
        const parsed = GetItemSchema.parse(args);
        result = await client.getItem(parsed.itemtype, parsed.id, {
          expandDropdowns: parsed.expand_dropdowns,
          withDevices: parsed.with_devices,
          withDisks: parsed.with_disks,
          withSoftwares: parsed.with_softwares,
          withConnections: parsed.with_connections,
          withNetworkports: parsed.with_networkports,
          withInfocoms: parsed.with_infocoms,
          withContracts: parsed.with_contracts,
          withDocuments: parsed.with_documents,
          withTickets: parsed.with_tickets,
          withProblems: parsed.with_problems,
          withChanges: parsed.with_changes,
          withNotes: parsed.with_notes,
          withLogs: parsed.with_logs,
        });
        break;
      }

      case 'glpi_list_items': {
        const parsed = ListItemsSchema.parse(args);
        result = await client.listItems(parsed.itemtype, {
          expand_dropdowns: parsed.expand_dropdowns,
          only_id: parsed.only_id,
          range: parsed.range,
          sort: parsed.sort,
          order: parsed.order,
          is_deleted: parsed.is_deleted,
          searchText: parsed.searchText,
        });
        break;
      }

      case 'glpi_create_item': {
        const parsed = CreateItemSchema.parse(args);
        result = await client.createItem(parsed.itemtype, parsed.input as Record<string, unknown> | Record<string, unknown>[]);
        break;
      }

      case 'glpi_update_item': {
        const parsed = UpdateItemSchema.parse(args);
        result = await client.updateItem(parsed.itemtype, parsed.id, parsed.input as Record<string, unknown>);
        break;
      }

      case 'glpi_update_items': {
        const parsed = UpdateItemsSchema.parse(args);
        result = await client.updateItems(parsed.itemtype, parsed.input as Array<Record<string, unknown> & { id: number }>);
        break;
      }

      case 'glpi_delete_item': {
        const parsed = DeleteItemSchema.parse(args);
        result = await client.deleteItem(parsed.itemtype, parsed.id, {
          forcePurge: parsed.force_purge,
          history: parsed.history,
        });
        break;
      }

      case 'glpi_delete_items': {
        const parsed = DeleteItemsSchema.parse(args);
        result = await client.deleteItems(parsed.itemtype, parsed.ids, {
          forcePurge: parsed.force_purge,
          history: parsed.history,
        });
        break;
      }

      case 'glpi_get_sub_items': {
        const parsed = GetSubItemsSchema.parse(args);
        result = await client.getSubItems(parsed.itemtype, parsed.id, parsed.sub_itemtype, {
          expandDropdowns: parsed.expand_dropdowns,
          range: parsed.range,
          sort: parsed.sort,
          order: parsed.order,
        });
        break;
      }

      case 'glpi_search': {
        const parsed = SearchSchema.parse(args);
        result = await client.search(parsed.itemtype, {
          criteria: parsed.criteria,
          sort: parsed.sort,
          order: parsed.order,
          range: parsed.range,
          forcedisplay: parsed.forcedisplay,
          giveItems: parsed.giveItems,
        });
        break;
      }

      case 'glpi_list_search_options': {
        const parsed = ListSearchOptionsSchema.parse(args);
        result = await client.listSearchOptions(parsed.itemtype);
        break;
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('GLPI MCP Server started\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
